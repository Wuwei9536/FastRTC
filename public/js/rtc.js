/* 数据通道 */
let dataChanel = null;
let audioEnabled;
let videoEnabled;

const url = window.location.href;
const roomHash = url.substring(url.lastIndexOf("/") + 1).toLowerCase();

// Element vars
const chatInput = document.querySelector(".compose input");
const remoteVideoVanilla = document.getElementById("remote-video");
const remoteVideo = document.getElementById("remote-video");
const captionText = document.getElementById("remote-video-text");
const localVideoText = document.getElementById("local-video-text");
const captionButtontext = document.getElementById("caption-button-text");
const entireChat = document.getElementById("entire-chat");
const chatZone = document.getElementById("chat-zone");

// Basic logging class wrapper
function logIt(message, error) {
  console.log(message);
}

const WebRTC = {
  connected: false,
  willInitiateCall: false,
  localICECandidates: [],
  socket: io(),
  remoteVideo: document.getElementById("remote-video"),
  localVideo: document.getElementById("local-video"),
  recognition: undefined,
  localStream: undefined,
  // Call to getUserMedia (provided by adapter.js for cross browser compatibility)
  // asking for access to both the video and audio streams. If the request is
  // accepted callback to the onMediaStream function, otherwise callback to the
  // noMediaStream function.
  requestMediaStream: function (event) {
    logIt("requestMediaStream");
    rePositionLocalVideo();
    navigator.mediaDevices
      .getUserMedia({
        video: true,
        audio: true,
      })
      .then((stream) => {
        WebRTC.onMediaStream(stream);
        localVideoText.textContent = "Drag Me";
        setTimeout(() => fadeOut(localVideoText), 5000);
      })
      .catch((error) => {
        logIt(error);
        logIt(
          "Failed to get local webcam video, check webcam privacy settings"
        );
        // Keep trying to get user media
        setTimeout(WebRTC.requestMediaStream, 1000);
      });
  },

  // Called when a video stream is added to WebRTC
  onMediaStream: function (stream) {
    logIt("onMediaStream");
    WebRTC.localStream = stream;
    // Add the stream as video's srcObject.
    // Now that we have webcam video sorted, prompt user to share URL
    WebRTC.localVideo.srcObject = stream;
    // Now we're ready to join the chat room.
    WebRTC.socket.emit("join", roomHash);
    // Add listeners to the websocket
    // WebRTC.socket.on("full", chatRoomFull);
    WebRTC.socket.on("offer", WebRTC.onOffer);
    WebRTC.socket.on("ready", WebRTC.readyToCall);
    WebRTC.socket.on(
      "willInitiateCall",
      () => (WebRTC.willInitiateCall = true)
    );
  },

  // When we are ready to call, enable the Call button.
  readyToCall: function (event) {
    logIt("readyToCall");
    // First to join call will most likely initiate call
    if (WebRTC.willInitiateCall) {
      logIt("Initiating call");
      WebRTC.startCall();
    }
  },

  // Set up a callback to run when we have the ephemeral token to use Twilio's TURN server.
  startCall: function (event) {
    logIt("startCall >>> Sending token request...");
    WebRTC.socket.on("iceServers", WebRTC.onIceServers(WebRTC.createOffer));
    WebRTC.socket.emit("iceServers", roomHash);
  },

  // When we receive the ephemeral token back from the server.
  onIceServers: function (callback) {
    logIt("onIceServers");
    return function (token) {
      logIt("<<< Received token");
      // Set up a new RTCPeerConnection using the token's iceServers.
      WebRTC.peerConnection = new RTCPeerConnection({
        iceServers: token.iceServers,
      });
      // Add the local video stream to the peerConnection.
      WebRTC.localStream.getTracks().forEach(function (track) {
        WebRTC.peerConnection.addTrack(track, WebRTC.localStream);
      });
      // Add general purpose data channel to peer connection,
      // used for text chats, captions, and toggling sending captions
      dataChanel = WebRTC.peerConnection.createDataChannel("chat", {
        negotiated: true,
        // both peers must have same id
        id: 0,
      });
      // Called when dataChannel is successfully opened
      dataChanel.onopen = function (event) {
        logIt("dataChannel opened");
      };
      // Handle different dataChannel types
      dataChanel.onmessage = function (event) {
        const receivedData = event.data;
        // First 4 chars represent data type
        const dataType = receivedData.substring(0, 4);
        const cleanedMessage = receivedData.slice(4);
        if (dataType === "mes:") {
          handleRecieveMessage(cleanedMessage);
        } else if (dataType === "cap:") {
          // recieveCaptions(cleanedMessage);
        } else if (dataType === "tog:") {
          // toggleSendCaptions();
        }
      };

      // Set up callbacks for the connection generating iceCandidates or
      // receiving the remote media stream.
      WebRTC.peerConnection.onicecandidate = WebRTC.onIceCandidate;
      WebRTC.peerConnection.ontrack = WebRTC.onTrack;
      // Set up listeners on the socket
      WebRTC.socket.on("candidate", WebRTC.onCandidate);
      WebRTC.socket.on("answer", WebRTC.onAnswer);

      // Called when there is a change in connection state
      WebRTC.peerConnection.oniceconnectionstatechange = function (event) {
        switch (WebRTC.peerConnection.iceConnectionState) {
          case "connected":
            logIt("connected");
            // Once connected we no longer have a need for the signaling server, so disconnect
            WebRTC.socket.disconnect();
            break;
          case "disconnected":
            logIt("disconnected");
          case "failed":
            logIt("failed");
            // WebRTC.socket.connect
            // WebRTC.createOffer();
            // Refresh page if connection has failed
            location.reload();
            break;
          case "closed":
            logIt("closed");
            break;
        }
      };
      callback();
    };
  },

  // When the peerConnection generates an ice candidate, send it over the socket to the peer.
  onIceCandidate: function (event) {
    logIt("onIceCandidate");
    if (event.candidate) {
      logIt(
        `<<< Received local ICE candidate from STUN/TURN server (${event.candidate.address})`
      );
      if (WebRTC.connected) {
        logIt(`>>> Sending local ICE candidate (${event.candidate.address})`);
        WebRTC.socket.emit(
          "candidate",
          JSON.stringify(event.candidate),
          roomHash
        );
      } else {
        // If we are not 'connected' to the other peer, we are buffering the local ICE candidates.
        // This most likely is happening on the "caller" side.
        // The peer may not have created the RTCPeerConnection yet, so we are waiting for the 'answer'
        // to arrive. This will signal that the peer is ready to receive signaling.
        WebRTC.localICECandidates.push(event.candidate);
      }
    }
  },

  // When receiving a candidate over the socket, turn it back into a real
  // RTCIceCandidate and add it to the peerConnection.
  onCandidate: function (candidate) {
    // Update caption text
    rtcCandidate = new RTCIceCandidate(JSON.parse(candidate));
    logIt(
      `onCandidate <<< Received remote ICE candidate (${rtcCandidate.address} - ${rtcCandidate.relatedAddress})`
    );
    WebRTC.peerConnection.addIceCandidate(rtcCandidate);
  },

  // Create an offer that contains the media capabilities of the browser.
  createOffer: function () {
    logIt("createOffer >>> Creating offer...");
    WebRTC.peerConnection.createOffer(
      function (offer) {
        // If the offer is created successfully, set it as the local description
        // and send it over the socket connection to initiate the peerConnection
        // on the other side.
        WebRTC.peerConnection.setLocalDescription(offer);
        WebRTC.socket.emit("offer", JSON.stringify(offer), roomHash);
      },
      function (err) {
        logIt("failed offer creation");
        logIt(err, true);
      }
    );
  },

  // Create an answer with the media capabilities that both browsers share.
  // This function is called with the offer from the originating browser, which
  // needs to be parsed into an RTCSessionDescription and added as the remote
  // description to the peerConnection object. Then the answer is created in the
  // same manner as the offer and sent over the socket.
  createAnswer: function (offer) {
    logIt("createAnswer");
    return function () {
      logIt(">>> Creating answer...");
      rtcOffer = new RTCSessionDescription(JSON.parse(offer));
      WebRTC.peerConnection.setRemoteDescription(rtcOffer);
      WebRTC.peerConnection.createAnswer(
        function (answer) {
          WebRTC.peerConnection.setLocalDescription(answer);
          WebRTC.socket.emit("answer", JSON.stringify(answer), roomHash);
        },
        function (err) {
          logIt("Failed answer creation.");
          logIt(err, true);
        }
      );
    };
  },

  // When a browser receives an offer, set up a callback to be run when the
  // ephemeral token is returned from Twilio.
  onOffer: function (offer) {
    logIt("onOffer <<< Received offer");
    WebRTC.socket.on(
      "iceServers",
      WebRTC.onIceServers(WebRTC.createAnswer(offer))
    );
    WebRTC.socket.emit("iceServers", roomHash);
  },

  // When an answer is received, add it to the peerConnection as the remote description.
  onAnswer: function (answer) {
    logIt("onAnswer <<< Received answer");
    var rtcAnswer = new RTCSessionDescription(JSON.parse(answer));
    // Set remote description of RTCSession
    WebRTC.peerConnection.setRemoteDescription(rtcAnswer);
    // The caller now knows that the callee is ready to accept new ICE candidates, so sending the buffer over
    WebRTC.localICECandidates.forEach((candidate) => {
      logIt(`>>> Sending local ICE candidate (${candidate.address})`);
      // Send ice candidate over websocket
      WebRTC.socket.emit("candidate", JSON.stringify(candidate), roomHash);
    });
    // Reset the buffer of local ICE candidates. This is not really needed, but it's good practice
    WebRTC.localICECandidates = [];
  },

  // Called when a stream is added to the peer connection
  onTrack: function (event) {
    logIt("onTrack <<< Received new stream from remote. Adding it...");
    // Update remote video source
    WebRTC.remoteVideo.srcObject = event.streams[0];
    document.getElementById("loader-ball").style.display = "none";
    // Close the initial share url snackbar
    // Remove the loading gif from video
    WebRTC.remoteVideo.style.background = "none";
    // Update connection status
    WebRTC.connected = true;
    // Hide caption status text
    // Reposition local video after a second, as there is often a delay
    // between adding a stream and the height of the video div changing
    // setTimeout(() => rePositionLocalVideo(), 500);
    // var timesRun = 0;
    // var interval = setInterval(function () {
    //   timesRun += 1;
    //   if (timesRun === 10) {
    //     clearInterval(interval);
    //   }
    //   rePositionLocalVideo();
    // }, 300);
  },
};

// Text Chat
// Add text message to chat screen on page
function addMessageToScreen(msg, isOwnMessage) {
  const msgContent = document.createElement("div");
  msgContent.setAttribute("class", "message");
  msgContent.textContent = msg;
  const msgBloc = document.createElement("div");
  msgBloc.setAttribute("class", "message-bloc");
  msgBloc.appendChild(msgContent);
  const msgItem = document.createElement("div");
  msgItem.setAttribute(
    "class",
    "message-item customer cssanimation fadeInBottom"
  );
  msgItem.appendChild(msgBloc);
  if (isOwnMessage) {
    document.getElementById("chat-messages").appendChild(msgItem);
  } else {
    document.getElementById("chat-messages").appendChild(msgItem);
  }
}

// Show and hide chat
function toggleChat() {
  var chatIcon = document.getElementById("chat-icon");
  var chatText = document.getElementById("chat-text");
  if (entireChat.style.display !== "none") {
    fadeOut(entireChat);
    // Update show chat buttton
    chatText.textContent("Show Chat");
    chatIcon.classList.remove("fa-comment-slash");
    chatIcon.classList.add("fa-comment");
  } else {
    fadeIn(entireChat);
    // Update show chat buttton
    chatText.textContent("Hide Chat");
    chatIcon.classList.remove("fa-comment");
    chatIcon.classList.add("fa-comment-slash");
  }
}

// Listen for enter press on chat input
chatInput.addEventListener("keypress", function (event) {
  if (event.keyCode === 13) {
    // Prevent page refresh on enter
    event.preventDefault();
    var msg = chatInput.value;
    // Prevent cross site scripting
    msg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Make links clickable
    msg = msg.autoLink();
    // Send message over data channel
    dataChanel.send("mes:" + msg);
    // Add message to screen
    addMessageToScreen(msg, true);
    // Auto scroll chat down
    chatZone.scrollTop = chatZone.scrollHeight;
    // Clear chat input
    chatInput.value = "";
  }
});

// Called when a message is recieved over the dataChannel
function handleRecieveMessage(msg) {
  // Add message to screen
  addMessageToScreen(msg, false);
  // Auto scroll chat down
  chatZone.scrollTop = chatZone.scrollHeight;
  // Show chat if hidden
  if (entireChat.style.display === "none") {
    toggleChat();
  }
}

function rePositionLocalVideo() {
  // Get position of remote video
  var bounds = remoteVideo.getBoundingClientRect();
  if (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  ) {
    // bounds.top = window.height * 0.7;
    bounds.left += 10;
  } else {
    bounds.top += 10;
    bounds.left += 10;
  }
  // Set position of local video
  document.getElementById("moveable").style.top = `${bounds.top}px`;
  document.getElementById("moveable").style.left = `${bounds.left}px`;
}

//Picture in picture
function togglePictureInPicture() {
  if (
    "pictureInPictureEnabled" in document ||
    remoteVideoVanilla.webkitSetPresentationMode
  ) {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch((error) => {
        logIt("Error exiting pip.");
        logIt(error);
      });
    } else if (remoteVideoVanilla.webkitPresentationMode === "inline") {
      remoteVideoVanilla.webkitSetPresentationMode("picture-in-picture");
    } else if (
      remoteVideoVanilla.webkitPresentationMode === "picture-in-picture"
    ) {
      remoteVideoVanilla.webkitSetPresentationMode("inline");
    } else {
      remoteVideoVanilla.requestPictureInPicture().catch((error) => {
        alert(
          "You must be connected to another person to enter picture in picture."
        );
      });
    }
  } else {
    alert(
      "Picture in picture is not supported in your browser. Consider using Chrome or Safari."
    );
  }
}
//Picture in picture

// Pause Video
function pauseVideo() {
  // Get video track to pause
  WebRTC.peerConnection.getSenders().forEach(function (sender) {
    if (sender.track.kind === "video") {
      sender.track.enabled = !sender.track.enabled;
      videoEnabled = sender.track.enabled;
    }
  });
  // select video button and video button text
  const videoButtonIcon = document.getElementById("video-icon");
  const videoButtonText = document.getElementById("video-text");
  // update pause button icon and text
  if (!videoEnabled) {
    localVideoText.textContent = "Video is paused";
    localVideoText.style.visibility = "visible";
    videoButtonIcon.classList.remove("fa-video");
    videoButtonIcon.classList.add("fa-video-slash");
    videoButtonText.innerText = "Unpause Video";
  } else {
    localVideoText.textContent = "Video unpaused";
    localVideoText.style.visibility = "hidden";
    videoButtonIcon.classList.add("fa-video");
    videoButtonIcon.classList.remove("fa-video-slash");
    videoButtonText.innerText = "Pause Video";
  }
}
// End pause Video

// Mute microphone
function muteMicrophone() {
  // Get audio track to mute
  WebRTC.peerConnection.getSenders().forEach(function (sender) {
    if (sender.track.kind === "audio") {
      sender.track.enabled = !sender.track.enabled;
      audioEnabled = sender.track.enabled;
    }
  });
  // select mic button and mic button text
  const micButtonIcon = document.getElementById("mic-icon");
  const micButtonText = document.getElementById("mic-text");
  // Update mute button text and icon
  if (audioEnabled) {
    micButtonIcon.classList.remove("fa-microphone");
    micButtonIcon.classList.add("fa-microphone-slash");
    micButtonText.innerText = "Unmute";
  } else {
    micButtonIcon.classList.add("fa-microphone");
    micButtonIcon.classList.remove("fa-microphone-slash");
    micButtonText.innerText = "Mute";
  }
}
// End Mute microphone

// Swap camera / screen share
function swap() {
  // Handle swap video before video call is connected
  if (!WebRTC.connected) {
    alert("You must join a call before you can share your screen.");
    return;
  }
  // Store swap button icon and text
  const swapIcon = document.getElementById("swap-icon");
  const swapText = document.getElementById("swap-text");
  // If mode is camera then switch to screen share
  if (mode === "camera") {
    // Show accept screenshare snackbar
    Snackbar.show({
      text:
        "Please allow screen share. Click the middle of the picture above and then press share.",
      width: "400px",
      pos: "bottom-center",
      actionTextColor: "#616161",
      duration: 50000,
    });
    // Request screen share, note we dont want to capture audio
    // as we already have the stream from the Webcam
    navigator.mediaDevices
      .getDisplayMedia({
        video: true,
        audio: false,
      })
      .then(function (stream) {
        // Close allow screenshare snackbar
        Snackbar.close();
        // Change display mode
        mode = "screen";
        // Update swap button icon and text
        swapIcon.classList.remove("fa-desktop");
        swapIcon.classList.add("fa-camera");
        swapText.innerText = "Share Webcam";
        switchStreamHelper(stream);
      })
      .catch(function (err) {
        logIt(err);
        logIt("Error sharing screen");
        Snackbar.close();
      });
    // If mode is screenshare then switch to webcam
  } else {
    // Stop the screen share track
    WebRTC.localVideo.srcObject.getTracks().forEach((track) => track.stop());
    // Get webcam input
    navigator.mediaDevices
      .getUserMedia({
        video: true,
        audio: true,
      })
      .then(function (stream) {
        // Change display mode
        mode = "camera";
        // Update swap button icon and text
        swapIcon.classList.remove("fa-camera");
        swapIcon.classList.add("fa-desktop");
        swapText.innerText = "Share Screen";
        switchStreamHelper(stream);
      });
  }
}

// Swap current video track with passed in stream
function switchStreamHelper(stream) {
  // Get current video track
  let videoTrack = stream.getVideoTracks()[0];
  // Add listen for if the current track swaps, swap back
  videoTrack.onended = function () {
    swap();
  };
  if (WebRTC.connected) {
    // Find sender
    const sender = WebRTC.peerConnection.getSenders().find(function (s) {
      // make sure tack types match
      return s.track.kind === videoTrack.kind;
    });
    // Replace sender track
    sender.replaceTrack(videoTrack);
  }
  // Update local video stream
  WebRTC.localStream = videoTrack;
  // Update local video object
  WebRTC.localVideo.srcObject = stream;
  // Unpause video on swap
  if (!videoEnabled) {
    pauseVideo();
  }
}
// End swap camera / screen share

WebRTC.requestMediaStream();

draggable(document.getElementById("moveable"));
