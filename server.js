const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");
const public = path.join(__dirname, "public");

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(path.join(public, "call.html"));
});

app.get("/rtc/*", (req, res) => {
  res.sendFile(path.join(public, "rtc.html"));
});

app.get("/authrtc/*", (req, res) => {
  res.sendFile(path.join(public, "rtc.html"));
});

app.get("/notsupported", (req, res) => {
  res.sendFile(path.join(public, "notsupported.html"));
});

function logIt(msg) {
  const date = new Date();
  console.log(`${date}:${msg}`);
}

io.on("connection", function (socket) {
  socket.on("join", function (room) {
    logIt(`A client joined the room ${room}`);
    var clients = io.sockets.adapter.rooms[room];
    var numClients = typeof clients !== "undefined" ? clients.length : 0;
    if (numClients === 0) {
      socket.join(room);
    } else if (numClients === 1) {
      socket.join(room);
      logIt(`room ${room} Broadcasting ready message`);
      socket.broadcast.to(room).emit("willInitiateCall", room);
      socket.emit("ready", room).to(room);
      socket.broadcast.to(room).emit("ready", room);
    } else {
      socket.emit("full", room);
    }
  });

  socket.on("iceServers", function (room) {
    var response = {
      /* Notice: 这边需要添加自己的 STUN/TURN 服务器, 可以考虑Coturn(https://github.com/coturn/coturn) */
      iceServers: [{ url: "stun:stun.l.google.com:19302" }],
    };
    socket.emit("iceServers", response).to(room);
  });

  // Relay candidate messages
  socket.on("candidate", function (candidate, room) {
    logIt(`${room} Received candidate. Broadcasting... ${candidate}`);
    socket.broadcast.to(room).emit("candidate", candidate);
  });

  // Relay offers
  socket.on("offer", function (offer, room) {
    socket.broadcast.to(room).emit("offer", offer);
  });

  // Relay answers
  socket.on("answer", function (answer, room) {
    socket.broadcast.to(room).emit("answer", answer);
  });
});

const port = process.env.PORT || 3000;
http.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
