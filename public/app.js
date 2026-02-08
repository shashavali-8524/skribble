const socket = io();

// Get room & player name
const ROOM = localStorage.getItem("roomId");
const NAME = localStorage.getItem("playerName");

// ---- REFRESH FIX: permanent token ----
let TOKEN = localStorage.getItem("playerToken");
if (!TOKEN) {
  TOKEN = crypto.randomUUID();
  localStorage.setItem("playerToken", TOKEN);
}

document.getElementById("roomInfo").innerText = "Room: " + ROOM;

// Join room logic moved to end of file to ensure listeners are ready

// ======================================
// BACK BUTTON
// ======================================
function goBack() {
  if (confirm("Are you sure you want to leave the game?")) {
    localStorage.removeItem("roomId");
    localStorage.removeItem("playerName");
    localStorage.removeItem("playerAvatar");
    // Don't remove token - keep it for future sessions
    window.location.href = "index.html";
  }
}


// ======================================
// SCOREBOARD UPDATE
// ======================================
socket.on("roomUpdate", (room) => {
  renderScoreboard(room.players);
});

function renderScoreboard(players) {
  const sb = document.getElementById("scoreboard");
  sb.innerHTML = players
    .map((p) => `<div class="player-score"><b>${p.name}</b>: ${p.score}</div>`)
    .join("");
}

// ======================================
// REAL-TIME SCORE UPDATES
// ======================================
socket.on("updateScores", (players) => {
  renderScoreboard(players);
});


// ======================================
// CANVAS + DRAWING (Drawer Only)
// ======================================
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let drawing = false;
let canDraw = false;
let lastX = 0,
  lastY = 0;

// Initialize drawing style
ctx.strokeStyle = "#000";
ctx.lineWidth = 3;
ctx.lineCap = "round";

canvas.addEventListener("mousedown", (e) => {
  if (!canDraw) return;

  if (currentTool === "bucket") {
    floodFill(e.offsetX, e.offsetY, currentColor);
    socket.emit("bucketFill", {
      roomId: ROOM,
      x: e.offsetX,
      y: e.offsetY,
      color: currentColor
    });
  } else {
    drawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing || !canDraw) return;

  const x = e.offsetX,
    y = e.offsetY;
  drawLine(lastX, lastY, x, y, true);
  [lastX, lastY] = [x, y];
});

canvas.addEventListener("mouseup", () => (drawing = false));
canvas.addEventListener("mouseleave", () => (drawing = false));

// ======================================
// TOUCH EVENTS (Mobile Support)
// ======================================
function getTouchPos(canvasDom, touchEvent) {
  const rect = canvasDom.getBoundingClientRect();
  return {
    x: touchEvent.touches[0].clientX - rect.left,
    y: touchEvent.touches[0].clientY - rect.top
  };
}

canvas.addEventListener("touchstart", (e) => {
  if (!canDraw) return;
  e.preventDefault(); // Prevent scrolling

  const pos = getTouchPos(canvas, e);

  if (currentTool === "bucket") {
    floodFill(pos.x, pos.y, currentColor);
    socket.emit("bucketFill", {
      roomId: ROOM,
      x: pos.x,
      y: pos.y,
      color: currentColor
    });
  } else {
    drawing = true;
    [lastX, lastY] = [pos.x, pos.y];
  }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  if (!drawing || !canDraw) return;
  e.preventDefault(); // Prevent scrolling

  const pos = getTouchPos(canvas, e);
  drawLine(lastX, lastY, pos.x, pos.y, true);
  [lastX, lastY] = [pos.x, pos.y];
}, { passive: false });

canvas.addEventListener("touchend", () => (drawing = false));

function drawLine(x0, y0, x1, y1, emit) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  if (!emit) return;

  socket.emit("drawingData", {
    roomId: ROOM,
    data: { x0, y0, x1, y1 },
  });
}

socket.on("drawingData", (data) => {
  drawLine(data.x0, data.y0, data.x1, data.y1, false);
});

socket.on("bucketFill", (data) => {
  floodFill(data.x, data.y, data.color);
});


// ======================================
// ROUND STARTED
// ======================================
socket.on("roundStarted", ({ drawerId, drawerName }) => {
  console.log("Round started! Drawer:", drawerName, "Am I drawer?", socket.id === drawerId);
  document.getElementById("drawerName").innerText = drawerName;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 🔥 FIX: Reset word display for new round
  const wordDisplay = document.getElementById("wordDisplay");
  wordDisplay.innerText = "SKRIBBL";
  wordDisplay.style.letterSpacing = "5px"; // Reset to default

  // 🔥 FIX: Hide word choice popup (in case it's still visible)
  const wordChoiceBox = document.getElementById("wordChoices");
  if (wordChoiceBox) {
    wordChoiceBox.style.display = "none";
  }

  // drawer-only drawing
  canDraw = socket.id === drawerId;

  const tools = document.getElementById("tools");
  const status = document.getElementById("status");

  if (canDraw) {
    tools.style.display = "flex";
    status.innerText = "YOU ARE DRAWING!";
    status.style.color = "#53E033"; // Green
    console.log("I am the drawer! Tools should be visible.");
  } else {
    tools.style.display = "none";
    status.innerText = "GUESS THE WORD!";
    status.style.color = "#fff";
    console.log("I am guessing.");
  }
});

// Tools
let currentTool = "pen"; // "pen", "eraser", or "bucket"
let currentColor = "#000";
let eraserSize = 15; // Default eraser size

function setColor(c) {
  currentColor = c;
  currentTool = "pen";
  ctx.strokeStyle = c;
  ctx.lineWidth = 3;
  document.getElementById("eraserBtn").style.background = "";
  document.getElementById("bucketBtn").style.background = "";
  document.getElementById("eraserSizeSelector").style.display = "none";
}

function selectEraser() {
  currentTool = "eraser";
  currentColor = null;
  ctx.strokeStyle = "rgba(255,255,255,1)";
  ctx.lineWidth = eraserSize;
  document.getElementById("eraserBtn").style.background = "#ddd";
  document.getElementById("bucketBtn").style.background = "";
  document.getElementById("eraserSizeSelector").style.display = "flex";
}

function setEraserSize(size) {
  eraserSize = size;
  ctx.lineWidth = size;

  // Update button styling
  document.getElementById("sizeSmall").classList.remove("active");
  document.getElementById("sizeMedium").classList.remove("active");
  document.getElementById("sizeLarge").classList.remove("active");

  if (size === 8) {
    document.getElementById("sizeSmall").classList.add("active");
  } else if (size === 15) {
    document.getElementById("sizeMedium").classList.add("active");
  } else if (size === 25) {
    document.getElementById("sizeLarge").classList.add("active");
  }
}

function selectBucketFill() {
  currentTool = "bucket";
  document.getElementById("bucketBtn").style.background = "#ddd";
  document.getElementById("eraserBtn").style.background = "";
  document.getElementById("eraserSizeSelector").style.display = "none";
}

function clearCanvas() {
  if (!canDraw) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit("clearCanvas", { roomId: ROOM });
}

socket.on("clearCanvas", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Flood fill algorithm for bucket tool
function floodFill(startX, startY, fillColor) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  // Get color at starting position
  const startIdx = (Math.floor(startY) * width + Math.floor(startX)) * 4;
  const targetColor = {
    r: data[startIdx],
    g: data[startIdx + 1],
    b: data[startIdx + 2],
    a: data[startIdx + 3]
  };

  // Convert fill color to RGB
  const fillRGB = hexToRgb(fillColor);

  // Check if target and fill colors are the same
  if (
    targetColor.r === fillRGB.r &&
    targetColor.g === fillRGB.g &&
    targetColor.b === fillRGB.b &&
    targetColor.a === 255
  ) {
    return; // No need to fill
  }

  const stack = [[Math.floor(startX), Math.floor(startY)]];

  while (stack.length > 0) {
    const [x, y] = stack.pop();

    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const idx = (y * width + x) * 4;
    const pixelColor = {
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
      a: data[idx + 3]
    };

    // Check if pixel matches target color
    if (
      pixelColor.r !== targetColor.r ||
      pixelColor.g !== targetColor.g ||
      pixelColor.b !== targetColor.b ||
      pixelColor.a !== targetColor.a
    ) {
      continue;
    }

    // Fill pixel
    data[idx] = fillRGB.r;
    data[idx + 1] = fillRGB.g;
    data[idx + 2] = fillRGB.b;
    data[idx + 3] = 255;

    // Add neighbors to stack
    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }

  ctx.putImageData(imageData, 0, 0);
}

// Helper function to convert hex color to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : { r: 0, g: 0, b: 0 };
}


// ======================================
// DRAWER WORD CHOICES
// ======================================
socket.on("chooseWord", ({ choices }) => {
  console.log("✅ RECEIVED chooseWord event! Choices:", choices);
  const box = document.getElementById("wordChoices");

  if (!box) {
    console.error("❌ wordChoices element not found!");
    return;
  }

  box.style.display = "flex";

  // TIMER LOGIC
  let timeLeft = 15;

  // Clear any existing interval attached to the box (if any)
  if (box.dataset.timerId) {
    clearInterval(parseInt(box.dataset.timerId));
  }

  box.innerHTML =
    `<h3>Choose a Word (<span id="choiceTimer">${timeLeft}</span>s)</h3>` +
    choices.map((w) => `<button class="wordBtn">${w}</button>`).join("<br>");

  const timerId = setInterval(() => {
    timeLeft--;
    const timerEl = document.getElementById("choiceTimer");
    if (timerEl) timerEl.innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(timerId);
      box.style.display = "none"; // Hide when time is up
    }
  }, 1000);

  // Store timer ID on the element so we can clear it if needed
  box.dataset.timerId = timerId;

  document.querySelectorAll(".wordBtn").forEach((btn) => {
    btn.onclick = () => {
      console.log("Word chosen:", btn.innerText);
      clearInterval(timerId);
      box.style.display = "none";
      socket.emit("drawerChosenWord", {
        roomId: ROOM,
        word: btn.innerText,
      });
    };
  });

  console.log("🎉 Word choice popup should now be visible!");
});


// ======================================
// WORD CHOSEN → START TIMER
// ======================================
let timerInterval = null; // Store interval ID to clear it later

socket.on("wordChosen", ({ guessTime, maskedWord, word, drawerId }) => {
  console.log("Word chosen event! Time:", guessTime, "Masked:", maskedWord, "Am I drawer?", socket.id === drawerId);

  // Clear any existing timer
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  // FORCE UPDATE TIMER TEXT IMMEDIATELY
  let t = guessTime;
  const timerEl = document.getElementById("timer");
  timerEl.innerText = t;

  // Show word if drawer, else show blanks
  const display = document.getElementById("wordDisplay");

  // 🔥 FIX: Ensure equality check is robust (strings vs numbers if any)
  if (socket.id == drawerId) {
    display.innerText = word;
    display.style.letterSpacing = "normal"; // Easier to read
    console.log("Showing full word:", word);
  } else {
    display.innerText = maskedWord.split("").join(" "); // Add spacing
    display.style.letterSpacing = "5px";
    console.log("Showing blanks:", maskedWord);
  }

  timerInterval = setInterval(() => {
    t--;
    timerEl.innerText = t;
    if (t <= 0) clearInterval(timerInterval);
  }, 1000);
});

// ======================================
// HINT UPDATE
// ======================================
socket.on("updateMaskedWord", (maskedWord) => {
  const display = document.getElementById("wordDisplay");

  // If we are drawer, we see full word, so ignore mask updates
  // But wait, the server sends this to everyone. We check drawer logic again.
  // Actually, we can just check if the text is already the full word? 
  // No, safer to check equality check again or store state.
  // We can just check the letterSpacing. If it's normal (drawer), don't update.

  if (display.style.letterSpacing !== "normal") {
    display.innerText = maskedWord.split("").join(" ");
    console.log("💡 Hint received:", maskedWord);
  }
});


// ======================================
// CHAT + GUESSES
// ======================================
document.getElementById("sendBtn").onclick = sendChat;

function sendChat() {
  const text = document.getElementById("chatInput").value.trim();
  if (!text) return;

  socket.emit("chatMessage", {
    roomId: ROOM,
    message: text,
  });

  document.getElementById("chatInput").value = "";
}

document.getElementById("chatInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendChat();
});

socket.on("chatMessage", ({ from, text }) => {
  const m = document.createElement("div");
  m.innerText = `${from}: ${text}`;
  document.getElementById("messages").appendChild(m);
});

socket.on("correctGuess", ({ playerName, points }) => {
  const m = document.createElement("div");
  m.innerText = `🎉 ${playerName} guessed correctly! +${points}`;
  m.style.color = "green";
  m.style.fontWeight = "bold";
  document.getElementById("messages").appendChild(m);
});


// ======================================
// ROUND ENDED
// ======================================
socket.on("roundEnded", ({ word }) => {
  const m = document.createElement("div");
  m.innerHTML = `
    <div style="background: #ddd; padding: 5px; text-align: center; border-radius: 5px; margin: 10px 0;">
      ⏳ Round ended!<br>The word was: <b>${word}</b>
    </div>
  `;
  document.getElementById("messages").appendChild(m);

  // Also show it at the top for brevity
  const display = document.getElementById("wordDisplay");
  display.innerText = word;
  display.style.letterSpacing = "normal";
});


// ======================================
// GAME OVER
// ======================================
// ======================================
// GAME OVER
// ======================================
socket.on("gameOver", ({ players }) => {
  const overlay = document.getElementById("gameOverOverlay");
  const sb = document.getElementById("finalScoreboard");

  // Sort players by score descending
  players.sort((a, b) => b.score - a.score);

  sb.innerHTML = players.map((p, i) => {
    const isWinner = i === 0;
    const badge = isWinner ? '<span class="winner-badge">👑</span>' : '';
    return `
      <div class="final-player-row">
        <span>${badge}${p.name}</span>
        <span>${p.score}</span>
      </div>
    `;
  }).join("");

  overlay.style.display = "flex";
});

// ======================================
// JOIN ROOM (Moved to end)
// ======================================
// Join room with TOKEN (refresh fix)
socket.emit(
  "joinRoom",
  { roomId: ROOM, name: NAME, token: TOKEN },
  (res) => {
    if (!res.ok) return alert(res.err);

    // If server gives new token, save it
    if (res.token) {
      TOKEN = res.token;
      localStorage.setItem("playerToken", TOKEN);
    }
  }
);
