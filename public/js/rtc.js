/* 数据通道 */
let dataChanel = null;
/* 是否输出音频流 */
let audioEnabled;
/* 是否输出视频流 */
let videoEnabled;
/* camera: 普通视屏流, screen: 共享屏幕 */
let mode = "camera";
/* 浏览器类型 */
const browserName = getBrowserName();
/* 是否支持WebRTC */
const isWebRTCSupported =
  navigator.getUserMedia ||
  navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia ||
  navigator.msGetUserMedia ||
  window.RTCPeerConnection;

const url = window.location.href;

const roomHash = url.substring(url.lastIndexOf("/") + 1).toLowerCase();

// Element 变量
const chatInput = document.querySelector(".compose input");
const remoteVideoGlobal = document.getElementById("remote-video");
const localVideoGlobal = document.getElementById("local-video");
const localVideoGlobalWrap = document.getElementById("moveable");
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

  /* 要求同时访问视频和音频流 */
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
        /* 继续尝试获取用户媒体 */
        setTimeout(WebRTC.requestMediaStream, 2000);
      });
  },

  /* 当获取到音视频流时调用 */
  onMediaStream: function (stream) {
    logIt("onMediaStream");
    WebRTC.localStream = stream;

    /* 将流添加为视频的srcObject */
    WebRTC.localVideo.srcObject = stream;

    /* 提示用户共享URL */
    Snackbar.show({
      text: "Here is the join link for your call: " + url,
      actionText: "Copy Link",
      width: "750px",
      pos: "top-center",
      actionTextColor: "#616161",
      duration: 500000,
      backgroundColor: "#16171a",
      onActionClick: function (element) {
        /* 将网址复制到剪贴板，这是通过创建一个临时元素来实现的，
           将我们想要的文本添加到该元素，选择它，然后将其删除  */
        const copyInput = document.createElement("input");
        copyInput.value = window.location.href;
        document.body.appendChild(copyInput);
        copyInput.select();
        document.execCommand("copy");
        document.body.removeChild(copyInput);
        Snackbar.close();
      },
    });
    // 加入聊天室
    WebRTC.socket.emit("join", roomHash);
    // 增加监听
    WebRTC.socket.on("full", chatRoomFull);
    WebRTC.socket.on("offer", WebRTC.onOffer);
    WebRTC.socket.on("ready", WebRTC.readyToCall);
    WebRTC.socket.on(
      "willInitiateCall",
      () => (WebRTC.willInitiateCall = true)
    );
  },

  //当我们准备好拨打电话时，启用“通话”按钮。
  readyToCall: function (event) {
    logIt("readyToCall");
    //最先加入通话的人最有可能发起通话
    if (WebRTC.willInitiateCall) {
      logIt("Initiating call");
      WebRTC.startCall();
    }
  },

  /* 呼叫 */
  startCall: function (event) {
    logIt("startCall >>> Sending token request...");
    /* 获取Turn服务器,并设置回调,回调执行完成后创建offer */
    WebRTC.socket.on("iceServers", WebRTC.onIceServers(WebRTC.createOffer));
    WebRTC.socket.emit("iceServers", roomHash);
  },

  /* 当获取到Turn服务器信息时调用 */
  onIceServers: function (callback) {
    logIt("onIceServers");
    return function (turn) {
      logIt("<<< Received turn");
      // 使用Turn建立RTCPeerConnection。
      WebRTC.peerConnection = new RTCPeerConnection({
        iceServers: turn.iceServers,
      });
      //将本地视频流添加到peerConnection。
      WebRTC.localStream.getTracks().forEach(function (track) {
        WebRTC.peerConnection.addTrack(track, WebRTC.localStream);
      });
      //将通用数据通道添加到对等连接，
      //用于文字聊天，字幕和切换发送字幕
      dataChanel = WebRTC.peerConnection.createDataChannel("chat", {
        negotiated: true,
        // both peers must have same id
        id: 0,
      });
      //成功打开dataChannel时调用
      dataChanel.onopen = function (event) {
        logIt("dataChannel opened");
      };
      //处理不同的dataChannel类型
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

      //为生成iceCandidates的连接和接收远程媒体流设置回调
      WebRTC.peerConnection.onicecandidate = WebRTC.onIceCandidate;
      WebRTC.peerConnection.ontrack = WebRTC.onTrack;
      //在套接字上设置侦听器
      WebRTC.socket.on("candidate", WebRTC.onCandidate);
      WebRTC.socket.on("answer", WebRTC.onAnswer);

      //当连接状态发生变化时调用
      WebRTC.peerConnection.oniceconnectionstatechange = function (event) {
        switch (WebRTC.peerConnection.iceConnectionState) {
          case "connected":
            logIt("connected");
            //一旦连接，我们就不再需要信令服务器，因此断开
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

  //当peerConnection生成一个ice候选对象时，将其通过套接字发送给对等连接。
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
        //如果我们未“连接”到其他对等方，则我们正在缓冲本地ICE候选对象。
        //这很可能发生在“调用方”一侧。
        //对等端可能尚未创建RTCPeerConnection，因此我们正在等待“answer”
        //到达。这将表明对等端已准备好接收信号。
        WebRTC.localICECandidates.push(event.candidate);
      }
    }
  },

  //当通过套接字接收候选人时，将其变回真实
  //RTCIceCandidate并将其添加到peerConnection。
  onCandidate: function (candidate) {
    //更新字幕
    captionText.textContent = "Found other user... connecting";
    rtcCandidate = new RTCIceCandidate(JSON.parse(candidate));
    logIt(
      `onCandidate <<< Received remote ICE candidate (${rtcCandidate.address} - ${rtcCandidate.relatedAddress})`
    );
    WebRTC.peerConnection.addIceCandidate(rtcCandidate);
  },

  //创建一个包含浏览器媒体功能的offer
  createOffer: function () {
    logIt("createOffer >>> Creating offer...");
    WebRTC.peerConnection.createOffer(
      function (offer) {
        //如果offer创建成功，则将其设置为本地描述
        //并通过套接字连接发送它以在另一方启动peerConnection
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

  /* 当收到offer时 去获取Turn服务器信息来建立RTCPeerConnection */
  onOffer: function (offer) {
    logIt("onOffer <<< Received offer");
    WebRTC.socket.on(
      "iceServers",
      WebRTC.onIceServers(WebRTC.createAnswer(offer))
    );
    WebRTC.socket.emit("iceServers", roomHash);
  },

  //收到答案后，将其添加到peerConnection作为远程描述
  onAnswer: function (answer) {
    logIt("onAnswer <<< Received answer");
    var rtcAnswer = new RTCSessionDescription(JSON.parse(answer));
    //设置RTCSession的远程描述
    WebRTC.peerConnection.setRemoteDescription(rtcAnswer);
    //现在，呼叫者知道被呼叫者已准备好接受新的ICE候选者
    WebRTC.localICECandidates.forEach((candidate) => {
      logIt(`>>> Sending local ICE candidate (${candidate.address})`);
      //通过websocket发送ice候选人
      WebRTC.socket.emit("candidate", JSON.stringify(candidate), roomHash);
    });
    //重置本地ICE候选者的缓冲区。
    WebRTC.localICECandidates = [];
  },

  //当流添加到对等连接时调用
  onTrack: function (event) {
    logIt("onTrack <<< Received new stream from remote. Adding it...");
    //更新远程视频源
    WebRTC.remoteVideo.srcObject = event.streams[0];
    //从视频中删除加载的gif
    document.getElementById("loader-ball").style.display = "none";
    //关闭初始共享网址栏
    Snackbar.close();
    //更新连接状态
    WebRTC.connected = true;
    //隐藏字幕状态文本
    fadeOut(captionText);
    //一秒钟后重新定位本地视频，因为通常会有延迟
    //在添加流和更改视频div的高度之间
    setTimeout(() => rePositionLocalVideo(), 500);
  },
};

//使用用户代理获取浏览器会话的名称
function getBrowserName() {
  if (window.navigator.userAgent.indexOf("MSIE") !== -1) {
    return "MSIE";
  } else if (window.navigator.userAgent.indexOf("Firefox") !== -1) {
    return "Firefox";
  } else if (window.navigator.userAgent.indexOf("Opera") !== -1) {
    return "Opera";
  } else if (window.navigator.userAgent.indexOf("Chrome") !== -1) {
    return "Chrome";
  } else if (window.navigator.userAgent.indexOf("Safari") !== -1) {
    return "Safari";
  }
  return "UnKnown";
}

//当套接字接收到房间已满的消息时调用
function chatRoomFull() {
  alert(
    "Chat room is full. Check to make sure you don't have multiple open tabs, or try with a new room link"
  );
  //退出房间并重定向
  window.location.href = "/newrtc";
}

//将本地视频重新定位到远程视频的左上方
function rePositionLocalVideo() {
  //获取远程视频的位置
  const bounds = remoteVideoGlobal.getBoundingClientRect();
  if (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  ) {
    bounds.top = window.height * 0.7;
    bounds.left += 10;
  } else {
    bounds.top += 10;
    bounds.left += 10;
  }
  //设置本地视频的位置
  localVideoGlobalWrap.style.top = `${bounds.top}px`;
  localVideoGlobalWrap.style.left = `${bounds.left}px`;
}

//麦克风静音
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

//暂停视频
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

// Text Chat
//显示和隐藏聊天
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

//将信息添加到页面上的聊天屏幕
function addMessageToScreen(msg, isOwnMessage) {
  const msgContent = document.createElement("div");
  msgContent.setAttribute("class", "message");
  msgContent.textContent = msg;
  const msgBloc = document.createElement("div");
  msgBloc.setAttribute("class", "message-bloc");
  msgBloc.appendChild(msgContent);
  const msgItem = document.createElement("div");
  msgItem.appendChild(msgBloc);
  if (isOwnMessage) {
    msgItem.setAttribute(
      "class",
      "message-item customer cssanimation fadeInBottom"
    );
  } else {
    msgItem.setAttribute(
      "class",
      "message-item moderator cssanimation fadeInBottom"
    );
  }
  document.getElementById("chat-messages").appendChild(msgItem);
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

//当通过dataChannel接收到消息时调用
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
// End Text

//Picture in picture
function togglePictureInPicture() {
  if (
    "pictureInPictureEnabled" in document ||
    remoteVideoGlobal.webkitSetPresentationMode
  ) {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch((error) => {
        logIt("Error exiting pip.");
        logIt(error);
      });
    } else if (remoteVideoGlobal.webkitPresentationMode === "inline") {
      remoteVideoGlobal.webkitSetPresentationMode("picture-in-picture");
    } else if (
      remoteVideoGlobal.webkitPresentationMode === "picture-in-picture"
    ) {
      remoteVideoGlobal.webkitSetPresentationMode("inline");
    } else {
      remoteVideoGlobal.requestPictureInPicture().catch((error) => {
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

function bootstrap() {
  //尝试检测应用内浏览器并重定向
  var ua = navigator.userAgent || navigator.vendor || window.opera;
  if (
    DetectRTC.isMobileDevice &&
    (ua.indexOf("FBAN") > -1 ||
      ua.indexOf("FBAV") > -1 ||
      ua.indexOf("Instagram") > -1)
  ) {
    if (DetectRTC.osName === "iOS") {
      window.location.href = "/notsupportedios";
    } else {
      window.location.href = "/notsupported";
    }
  }

  // 重定向不是Safari的所有iOS浏览器;
  // if (DetectRTC.isMobileDevice) {
  //   if (DetectRTC.osName === "iOS" && !DetectRTC.browser.isSafari) {
  //     window.location.href = "/notsupportedios";
  //   }
  // }

  if (!isWebRTCSupported || browserName === "MSIE") {
    window.location.href = "/notsupported";
  }
  //加载网络摄像头
  WebRTC.requestMediaStream();

  //默认情况下隐藏文字聊天
  entireChat.style.display = "none";

  //在开始时设置字幕
  captionText.textContent = "Waiting for other user to join...";
  fadeIn(captionText);

  draggable(localVideoGlobalWrap);

  // Show accept webcam snackbar
  Snackbar.show({
    text: "Please allow microphone and webcam access",
    actionText: "Show Me How",
    width: "455px",
    pos: "top-right",
    actionTextColor: "#616161",
    duration: 50000,
    onActionClick: function (element) {
      window.open(
        "https://getacclaim.zendesk.com/hc/en-us/articles/360001547832-Setting-the-default-camera-on-your-browser",
        "_blank"
      );
    },
  });

  //在更改媒体设备时刷新页面并切换到系统默认值
  navigator.mediaDevices.ondevicechange = () => window.location.reload();
}

bootstrap();
