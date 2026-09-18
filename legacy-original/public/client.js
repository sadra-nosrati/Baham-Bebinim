const socket = io();

// DOM elements
let currentRoomId = null;
let currentUser = null;
let currentVideoElement = null;
let isSyncing = false;
let isLeader = false;
let currentLeaderId = null;

// Initialize video player (with or without controls)
function initVideoPlayer() {
  const videoContainer = document.getElementById("video-player");

  // Create video element WITHOUT controls for non-leaders
  const controlsAttr = isLeader ? "controls" : "";
  videoContainer.innerHTML = `
        <video id="main-video" ${controlsAttr}>
            <source id="video-source" src="" type="video/mp4">
            Your browser does not support the video tag.
        </video>
    `;

  currentVideoElement = document.getElementById("main-video");

  // Add event listeners for sync (only if user is leader)
  if (currentVideoElement && isLeader) {
    currentVideoElement.addEventListener("play", () => {
      if (isLeader && !isSyncing && currentRoomId) {
        socket.emit("play-video", {
          roomId: currentRoomId,
          currentTime: currentVideoElement.currentTime,
        });
      }
    });

    currentVideoElement.addEventListener("pause", () => {
      if (isLeader && !isSyncing && currentRoomId) {
        socket.emit("pause-video", {
          roomId: currentRoomId,
          currentTime: currentVideoElement.currentTime,
        });
      }
    });

    currentVideoElement.addEventListener("seeked", () => {
      if (isLeader && !isSyncing && currentRoomId) {
        socket.emit("seek-video", {
          roomId: currentRoomId,
          currentTime: currentVideoElement.currentTime,
        });
      }
    });
  }

  // Add styles to hide cursor on non-leader videos
  if (!isLeader && currentVideoElement) {
    currentVideoElement.style.cursor = "default";
    currentVideoElement.style.pointerEvents = "none";
  }
}

// Reinitialize player when leader status changes
function reinitPlayer() {
  const videoContainer = document.getElementById("video-player");
  const currentSrc = currentVideoElement ? currentVideoElement.src : null;
  const currentTime = currentVideoElement ? currentVideoElement.currentTime : 0;

  initVideoPlayer();
  currentVideoElement = document.getElementById("main-video");

  if (currentSrc) {
    const videoSource = document.getElementById("video-source");
    videoSource.src = currentSrc;
    currentVideoElement.load();
    currentVideoElement.currentTime = currentTime;
  }
}

// Load video from URL (only leader)
function loadVideo(url) {
  if (!isLeader) {
    showNotification("تنها لیدر اتاق می‌تواند ویدئو را تغییر دهد!", "error");
    return false;
  }

  if (!currentVideoElement) {
    initVideoPlayer();
    currentVideoElement = document.getElementById("main-video");
  }

  const videoSource = document.getElementById("video-source");

  try {
    videoSource.src = url;
    currentVideoElement.load();

    // Show info
    document.getElementById("video-info").innerHTML = "✅ ویدئو بارگذاری شد";
    setTimeout(() => {
      document.getElementById("video-info").innerHTML = "";
    }, 3000);

    // Remove placeholder if exists
    const placeholder = document.querySelector(".placeholder");
    if (placeholder) placeholder.style.display = "none";

    return true;
  } catch (error) {
    console.error("Error loading video:", error);
    showNotification("خطا در بارگذاری ویدئو!", "error");
    return false;
  }
}

// Control functions for non-leaders (sync only - no UI controls)
function syncPlay(time) {
  if (currentVideoElement && !isLeader) {
    isSyncing = true;
    if (
      time !== undefined &&
      Math.abs(currentVideoElement.currentTime - time) > 0.3
    ) {
      currentVideoElement.currentTime = time;
    }
    currentVideoElement.play().catch((e) => console.log("Play error:", e));
    setTimeout(() => {
      isSyncing = false;
    }, 500);
  }
}

function syncPause(time) {
  if (currentVideoElement && !isLeader) {
    isSyncing = true;
    if (
      time !== undefined &&
      Math.abs(currentVideoElement.currentTime - time) > 0.3
    ) {
      currentVideoElement.currentTime = time;
    }
    currentVideoElement.pause();
    setTimeout(() => {
      isSyncing = false;
    }, 500);
  }
}

function syncSeek(time) {
  if (currentVideoElement && !isLeader) {
    isSyncing = true;
    currentVideoElement.currentTime = time;
    setTimeout(() => {
      isSyncing = false;
    }, 500);
  }
}

// Update UI based on leader status
function updateLeaderUI() {
  const leaderBadge = document.getElementById("leader-badge");
  const videoUrlInput = document.getElementById("video-url");
  const loadVideoBtn = document.getElementById("load-video");

  if (isLeader) {
    leaderBadge.style.display = "inline-block";
    videoUrlInput.disabled = false;
    loadVideoBtn.disabled = false;
    document.getElementById("video-info").innerHTML =
      "👑 شما لیدر هستید و کنترل ویدئو را دارید";
    document.getElementById("video-info").style.color = "#4ade80";

    // Reinitialize player with controls
    reinitPlayer();
  } else {
    leaderBadge.style.display = "none";
    videoUrlInput.disabled = true;
    loadVideoBtn.disabled = true;
    document.getElementById("video-info").innerHTML =
      "🎬 در حالت تماشا هستید. لیدر ویدئو را کنترل می‌کند";
    document.getElementById("video-info").style.color = "#999";

    // Reinitialize player without controls
    reinitPlayer();
  }
}

// Update users list
function updateUsersList(data) {
  const usersList = document.getElementById("users-list");
  const { users, leaderId } = data;

  usersList.innerHTML = users
    .map(
      (user) => `
        <li>
            ${user.id === leaderId ? '<span class="leader-icon">👑</span>' : "👤"}
            ${escapeHtml(user.name)}
            ${user.id === leaderId ? ' <strong style="color:#f5576c">(لیدر)</strong>' : ""}
            ${user.id === socket.id ? ' <span style="color:#667eea">(تو)</span>' : ""}
        </li>
    `,
    )
    .join("");

  document.getElementById("user-count").textContent = users.length;
  currentLeaderId = leaderId;
}

// Show notification
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === "error" ? "#f5576c" : "#4ade80"};
        color: white;
        border-radius: 10px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Add chat message
function addChatMessage(data) {
  const chatMessages = document.getElementById("chat-messages");
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${data.userName === currentUser ? "own-message" : ""} ${data.isLeader ? "leader-message" : ""}`;

  messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-sender ${data.isLeader ? "leader" : ""}">
                ${data.isLeader ? "👑 " : ""}${escapeHtml(data.userName)}
            </span>
            <span class="message-time">${data.timestamp}</span>
        </div>
        <div class="message-content">${escapeHtml(data.message)}</div>
    `;

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Socket Event Listeners
socket.on("room-state", (state) => {
  console.log("Room state received:", state);
  isLeader = state.isLeader;
  currentLeaderId = state.leaderId;

  updateLeaderUI();

  if (state.videoUrl) {
    isSyncing = true;
    if (!currentVideoElement) {
      initVideoPlayer();
      currentVideoElement = document.getElementById("main-video");
    }

    const videoSource = document.getElementById("video-source");
    videoSource.src = state.videoUrl;
    currentVideoElement.load();

    setTimeout(() => {
      if (state.isPlaying) {
        currentVideoElement.currentTime = state.currentTime;
        if (!isLeader) {
          currentVideoElement
            .play()
            .catch((e) => console.log("Play error:", e));
        }
      } else {
        currentVideoElement.currentTime = state.currentTime;
        currentVideoElement.pause();
      }
      isSyncing = false;
    }, 500);
  }
});

socket.on("video-update", ({ videoUrl, currentTime, isPlaying }) => {
  if (videoUrl && currentVideoElement) {
    isSyncing = true;
    const videoSource = document.getElementById("video-source");
    videoSource.src = videoUrl;
    currentVideoElement.load();

    setTimeout(() => {
      currentVideoElement.currentTime = currentTime;
      if (isPlaying && !isLeader) {
        currentVideoElement.play();
      }
      isSyncing = false;
    }, 500);
  }
});

socket.on("video-play", ({ currentTime }) => {
  if (!isLeader) {
    syncPlay(currentTime);
  }
});

socket.on("video-pause", ({ currentTime }) => {
  if (!isLeader) {
    syncPause(currentTime);
  }
});

socket.on("video-seek", ({ currentTime }) => {
  if (!isLeader) {
    syncSeek(currentTime);
  }
});

socket.on("users-update", (data) => {
  updateUsersList(data);
});

socket.on("leader-changed", ({ newLeaderName }) => {
  const wasLeader = isLeader;
  isLeader = socket.id === currentLeaderId;
  updateLeaderUI();
  showNotification(`${newLeaderName} لیدر جدید شد!`, "info");
});

socket.on("new-chat-message", (data) => {
  addChatMessage(data);
});

socket.on("error-message", (message) => {
  showNotification(message, "error");
});

// UI Event Handlers
document.getElementById("join-btn").addEventListener("click", () => {
  const userName = document.getElementById("user-name").value.trim();
  const roomId = document.getElementById("room-id").value.trim();

  if (!userName || !roomId) {
    showNotification("لطفاً نام و شناسه اتاق را وارد کنید!", "error");
    return;
  }

  currentUser = userName;
  currentRoomId = roomId;

  socket.emit("join-room", { roomId, userName });

  document.getElementById("join-screen").classList.remove("active");
  document.getElementById("room-screen").classList.add("active");
  document.getElementById("room-id-display").textContent = roomId;

  // Initialize video player (will be configured based on leader status after room-state)
  initVideoPlayer();
});

document.getElementById("load-video").addEventListener("click", () => {
  const videoUrl = document.getElementById("video-url").value.trim();
  if (videoUrl && currentRoomId && isLeader) {
    if (loadVideo(videoUrl)) {
      socket.emit("set-video", { roomId: currentRoomId, videoUrl });
      if (currentVideoElement) {
        currentVideoElement.pause();
      }
    }
  } else if (!isLeader) {
    showNotification("تنها لیدر می‌تواند ویدئو را تغییر دهد!", "error");
  } else if (!videoUrl) {
    showNotification("لطفاً لینک ویدئو را وارد کنید!", "error");
  }
});

document.getElementById("send-chat").addEventListener("click", () => {
  const message = document.getElementById("chat-input").value.trim();
  if (message && currentRoomId) {
    socket.emit("chat-message", {
      roomId: currentRoomId,
      message: message,
      userName: currentUser,
    });
    document.getElementById("chat-input").value = "";
  }
});

document.getElementById("chat-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    document.getElementById("send-chat").click();
  }
});

document.getElementById("leave-btn").addEventListener("click", () => {
  document.getElementById("room-screen").classList.remove("active");
  document.getElementById("join-screen").classList.add("active");
  document.getElementById("video-player").innerHTML =
    '<div class="placeholder">🎥 لینک ویدئو را وارد کنید</div>';
  document.getElementById("video-url").value = "";
  document.getElementById("chat-messages").innerHTML = "";
  currentRoomId = null;
  isLeader = false;
  currentVideoElement = null;
  window.location.reload();
});

// Add CSS to hide video controls for non-leaders
const style = document.createElement("style");
style.textContent = `
    video::-webkit-media-controls {
        display: none !important;
    }
    video {
        pointer-events: none;
    }
    video[controls] {
        pointer-events: auto;
    }
    video[controls]::-webkit-media-controls {
        display: flex !important;
    }
`;
document.head.appendChild(style);

// Auto reconnect
socket.on("disconnect", () => {
  showNotification(
    "ارتباط با سرور قطع شد! لطفاً صفحه را refresh کنید.",
    "error",
  );
});
