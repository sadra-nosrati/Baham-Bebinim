const express = require("express");
const http = require("http");
const path = require("path");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// Store room data
const roomsData = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // User joins a room
  socket.on("join-room", ({ roomId, userName }) => {
    socket.join(roomId);

    // Initialize room data if not exists
    if (!roomsData[roomId]) {
      roomsData[roomId] = {
        videoUrl: null,
        currentTime: 0,
        isPlaying: false,
        leaderId: null,
        users: [],
      };
    }

    // Check if this is first user in room
    const isFirstUser = roomsData[roomId].users.length === 0;

    // Add user to room users list
    const user = { id: socket.id, name: userName };
    roomsData[roomId].users.push(user);

    // Set leader if room was empty
    if (isFirstUser) {
      roomsData[roomId].leaderId = socket.id;
    }

    // Send current room state to the new user
    socket.emit("room-state", {
      videoUrl: roomsData[roomId].videoUrl,
      currentTime: roomsData[roomId].currentTime,
      isPlaying: roomsData[roomId].isPlaying,
      leaderId: roomsData[roomId].leaderId,
      isLeader: roomsData[roomId].leaderId === socket.id,
    });

    // Send updated users list and leader info to all in room
    io.to(roomId).emit("users-update", {
      users: roomsData[roomId].users,
      leaderId: roomsData[roomId].leaderId,
    });

    console.log(`${userName} joined room ${roomId} (Leader: ${isFirstUser})`);
  });

  // Set video URL (only leader)
  socket.on("set-video", ({ roomId, videoUrl }) => {
    if (!roomsData[roomId]) return;

    // Check if user is leader
    if (roomsData[roomId].leaderId !== socket.id) {
      socket.emit(
        "error-message",
        "Only the room leader can change the video!",
      );
      return;
    }

    roomsData[roomId].videoUrl = videoUrl;
    roomsData[roomId].currentTime = 0;
    roomsData[roomId].isPlaying = false;

    io.to(roomId).emit("video-update", {
      videoUrl,
      currentTime: 0,
      isPlaying: false,
    });
  });

  // Video control: play (only leader)
  socket.on("play-video", ({ roomId, currentTime }) => {
    if (!roomsData[roomId]) return;

    // Check if user is leader
    if (roomsData[roomId].leaderId !== socket.id) {
      socket.emit(
        "error-message",
        "Only the room leader can control playback!",
      );
      return;
    }

    roomsData[roomId].isPlaying = true;
    roomsData[roomId].currentTime = currentTime;

    // Broadcast to all OTHER users in room
    socket.to(roomId).emit("video-play", {
      currentTime: currentTime,
      leaderId: roomsData[roomId].leaderId,
    });
  });

  // Video control: pause (only leader)
  socket.on("pause-video", ({ roomId, currentTime }) => {
    if (!roomsData[roomId]) return;

    // Check if user is leader
    if (roomsData[roomId].leaderId !== socket.id) {
      socket.emit(
        "error-message",
        "Only the room leader can control playback!",
      );
      return;
    }

    roomsData[roomId].isPlaying = false;
    roomsData[roomId].currentTime = currentTime;

    // Broadcast to all OTHER users in room
    socket.to(roomId).emit("video-pause", {
      currentTime: currentTime,
      leaderId: roomsData[roomId].leaderId,
    });
  });

  // Video control: seek (only leader)
  socket.on("seek-video", ({ roomId, currentTime }) => {
    if (!roomsData[roomId]) return;

    // Check if user is leader
    if (roomsData[roomId].leaderId !== socket.id) {
      socket.emit("error-message", "Only the room leader can seek!");
      return;
    }

    roomsData[roomId].currentTime = currentTime;

    // Broadcast to all OTHER users in room
    socket.to(roomId).emit("video-seek", {
      currentTime: currentTime,
      leaderId: roomsData[roomId].leaderId,
    });
  });

  // Chat message
  socket.on("chat-message", ({ roomId, message, userName }) => {
    if (!roomsData[roomId]) return;

    io.to(roomId).emit("new-chat-message", {
      userName: userName,
      message: message,
      timestamp: new Date().toLocaleTimeString(),
      isLeader: roomsData[roomId].leaderId === socket.id,
    });
  });

  // Disconnect user
  socket.on("disconnect", () => {
    let removedFromRoom = null;
    let wasLeader = false;

    // Find and remove user from rooms
    for (const roomId in roomsData) {
      const index = roomsData[roomId].users.findIndex(
        (u) => u.id === socket.id,
      );
      if (index !== -1) {
        removedFromRoom = roomId;
        wasLeader = roomsData[roomId].leaderId === socket.id;
        roomsData[roomId].users.splice(index, 1);

        // If leader left and there are other users, assign new leader
        if (wasLeader && roomsData[roomId].users.length > 0) {
          roomsData[roomId].leaderId = roomsData[roomId].users[0].id;

          // Notify all users about new leader
          io.to(roomId).emit("leader-changed", {
            newLeaderId: roomsData[roomId].leaderId,
            newLeaderName: roomsData[roomId].users[0].name,
          });
        } else if (roomsData[roomId].users.length === 0) {
          // Clean up empty room
          delete roomsData[roomId];
        }

        // Update users list for remaining users
        if (roomsData[roomId]) {
          io.to(roomId).emit("users-update", {
            users: roomsData[roomId].users,
            leaderId: roomsData[roomId].leaderId,
          });
        }

        break;
      }
    }

    console.log(
      "User disconnected:",
      socket.id,
      wasLeader ? "(was leader)" : "",
    );
  });
});

const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
