const socket = io();

// ======================================
// SESSION DATA
// ======================================
const ROOM = localStorage.getItem("roomId");
const NAME = localStorage.getItem("playerName");
const AVATAR = localStorage.getItem("playerAvatar") || "😐";

let TOKEN = localStorage.getItem("playerToken");
if (!TOKEN) { TOKEN = crypto.randomUUID(); localStorage.setItem("playerToken", TOKEN); }

if (!ROOM || !NAME) { alert("Session expired"); location.href = "index.html"; }

document.getElementById("roomInfo").innerText = "Room: " + ROOM;

// ======================================
// TOAST NOTIFICATIONS
// ======================================
function showToast(msg, type = "", duration = 2500) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerText = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("show"));
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ======================================
// BACK BUTTON
// ======================================
function goBack() {
  if (confirm("Leave the game?")) {
    localStorage.removeItem("roomId");
    localStorage.removeItem("playerToken");
    location.href = "index.html";
  }
}

// ======================================
// SCOREBOARD
// ======================================
let currentDrawerId = null;
let playersData = [];

socket.on("roomUpdate", (room) => {
  playersData = room.players;
  renderScoreboard(room.players);
});

socket.on("updateScores", (players) => {
  playersData = players;
  renderScoreboard(players);
});

function renderScoreboard(players) {
  const sb = document.getElementById("scoreboard");
  const sorted = [...players].sort((a, b) => b.score - a.score);

  sb.innerHTML = '<div class="scoreboard-title">Players</div>' +
    sorted.map(p => {
      const isDrawing = p.id === currentDrawerId;
      const hasGuessed = p.guessed;
      let cls = "player-score";
      if (isDrawing) cls += " drawing";
      else if (hasGuessed) cls += " guessed";

      return `<div class="${cls}">
        <span class="avatar">${p.avatar || "😐"}</span>
        <span class="name">${escapeHtml(p.name)}</span>
        <span class="score">${p.score}</span>
      </div>`;
    }).join("");
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.innerText = text;
  return d.innerHTML;
}

// ======================================
// CANVAS SETUP
// ======================================
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const CANVAS_W = 800;
const CANVAS_H = 600;

let drawing = false;
let canDraw = false;
let lastX = 0, lastY = 0;

// Undo system
let undoStack = [];
const MAX_UNDO = 30;

function saveCanvasState() {
  undoStack.push(canvas.toDataURL());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function undoLast() {
  if (!canDraw || undoStack.length === 0) return;
  const prev = undoStack.pop();
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(img, 0, 0);
  };
  img.src = prev;
  socket.emit("undoAction", { roomId: ROOM });
}

// Initialize
ctx.strokeStyle = "#000";
ctx.lineWidth = 3;
ctx.lineCap = "round";
ctx.lineJoin = "round";

// ======================================
// COORDINATE SCALING (Critical for mobile)
// ======================================
function getCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

// ======================================
// MOUSE EVENTS
// ======================================
canvas.addEventListener("mousedown", (e) => {
  if (!canDraw) return;
  const pos = getCanvasCoords(e.clientX, e.clientY);

  if (currentTool === "bucket") {
    saveCanvasState();
    floodFill(pos.x, pos.y, currentColor);
    socket.emit("bucketFill", { roomId: ROOM, x: pos.x, y: pos.y, color: currentColor });
    return;
  }

  saveCanvasState();
  drawing = true;
  lastX = pos.x;
  lastY = pos.y;

  // Draw a dot for single clicks
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.fillStyle = currentTool === "eraser" ? "#ffffff" : currentColor;
  ctx.fill();
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing || !canDraw) return;
  const pos = getCanvasCoords(e.clientX, e.clientY);
  drawLine(lastX, lastY, pos.x, pos.y, true);
  lastX = pos.x;
  lastY = pos.y;
});

canvas.addEventListener("mouseup", () => drawing = false);
canvas.addEventListener("mouseleave", () => drawing = false);

// ======================================
// TOUCH EVENTS (Mobile - Fixed!)
// ======================================
canvas.addEventListener("touchstart", (e) => {
  if (!canDraw) return;
  e.preventDefault();
  e.stopPropagation();

  const touch = e.touches[0];
  const pos = getCanvasCoords(touch.clientX, touch.clientY);

  if (currentTool === "bucket") {
    saveCanvasState();
    floodFill(pos.x, pos.y, currentColor);
    socket.emit("bucketFill", { roomId: ROOM, x: pos.x, y: pos.y, color: currentColor });
    return;
  }

  saveCanvasState();
  drawing = true;
  lastX = pos.x;
  lastY = pos.y;

  // Draw dot
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.fillStyle = currentTool === "eraser" ? "#ffffff" : currentColor;
  ctx.fill();
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  if (!drawing || !canDraw) return;
  e.preventDefault();
  e.stopPropagation();

  const touch = e.touches[0];
  const pos = getCanvasCoords(touch.clientX, touch.clientY);
  drawLine(lastX, lastY, pos.x, pos.y, true);
  lastX = pos.x;
  lastY = pos.y;
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  if (drawing) e.preventDefault();
  drawing = false;
}, { passive: false });

canvas.addEventListener("touchcancel", () => drawing = false);

// ======================================
// DRAW LINE
// ======================================
function drawLine(x0, y0, x1, y1, emit) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  if (emit) {
    socket.emit("drawingData", {
      roomId: ROOM,
      data: {
        x0, y0, x1, y1,
        color: ctx.strokeStyle,
        width: ctx.lineWidth,
        tool: currentTool
      }
    });
  }
}

// Receive drawing from others
socket.on("drawingData", (data) => {
  const prevStyle = ctx.strokeStyle;
  const prevWidth = ctx.lineWidth;

  ctx.strokeStyle = data.tool === "eraser" ? "#ffffff" : (data.color || "#000");
  ctx.lineWidth = data.width || 3;

  ctx.beginPath();
  ctx.moveTo(data.x0, data.y0);
  ctx.lineTo(data.x1, data.y1);
  ctx.stroke();

  ctx.strokeStyle = prevStyle;
  ctx.lineWidth = prevWidth;
});

socket.on("bucketFill", (data) => floodFill(data.x, data.y, data.color));
socket.on("clearCanvas", () => { ctx.clearRect(0, 0, CANVAS_W, CANVAS_H); undoStack = []; });

socket.on("undoAction", () => {
  // Others just clear and can't restore - simplified sync
  // In real implementation you'd sync state; here we just acknowledge
});

// ======================================
// TOOLS
// ======================================
let currentTool = "pen";
let currentColor = "#000";
let currentBrushSize = 3;

function setColor(c) {
  currentColor = c;
  if (currentTool !== "bucket") {
    currentTool = "pen";
    ctx.strokeStyle = c;
    updateToolButtons();
  }
  ctx.strokeStyle = c;

  // Update color indicators
  document.querySelectorAll(".color-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.color === c);
  });
}

function selectPen() {
  currentTool = "pen";
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = currentBrushSize;
  updateToolButtons();
}

function selectEraser() {
  currentTool = "eraser";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(currentBrushSize, 10);
  document.getElementById("brushSlider").value = ctx.lineWidth;
  document.getElementById("brushLabel").innerText = ctx.lineWidth + "px";
  updateToolButtons();
}

function selectBucket() {
  currentTool = "bucket";
  updateToolButtons();
}

function setBrushSize(val) {
  currentBrushSize = Number(val);
  ctx.lineWidth = currentBrushSize;
  document.getElementById("brushLabel").innerText = val + "px";
}

function updateToolButtons() {
  document.getElementById("penBtn").classList.toggle("active", currentTool === "pen");
  document.getElementById("eraserBtn").classList.toggle("active", currentTool === "eraser");
  document.getElementById("bucketBtn").classList.toggle("active", currentTool === "bucket");
}

function clearCanvas() {
  if (!canDraw) return;
  saveCanvasState();
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  socket.emit("clearCanvas", { roomId: ROOM });
}

// ======================================
// FLOOD FILL (Optimized - scanline)
// ======================================
function floodFill(startX, startY, fillColor) {
  const sx = Math.round(startX), sy = Math.round(startY);
  if (sx < 0 || sx >= CANVAS_W || sy < 0 || sy >= CANVAS_H) return;

  const imageData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const data = imageData.data;
  const w = CANVAS_W, h = CANVAS_H;

  const startIdx = (sy * w + sx) * 4;
  const tR = data[startIdx], tG = data[startIdx + 1], tB = data[startIdx + 2], tA = data[startIdx + 3];

  const fill = hexToRgb(fillColor);
  if (!fill) return;

  // Same color check
  if (tR === fill.r && tG === fill.g && tB === fill.b && tA === 255) return;

  const tolerance = 30;

  function matches(idx) {
    return Math.abs(data[idx] - tR) <= tolerance &&
      Math.abs(data[idx + 1] - tG) <= tolerance &&
      Math.abs(data[idx + 2] - tB) <= tolerance &&
      Math.abs(data[idx + 3] - tA) <= tolerance;
  }

  function setPixel(idx) {
    data[idx] = fill.r;
    data[idx + 1] = fill.g;
    data[idx + 2] = fill.b;
    data[idx + 3] = 255;
  }

  // Scanline flood fill (much faster than pixel-by-pixel stack)
  const stack = [[sx, sy]];
  const visited = new Uint8Array(w * h);
  let iterations = 0;
  const maxIterations = w * h;

  while (stack.length > 0 && iterations < maxIterations) {
    iterations++;
    const [x, y] = stack.pop();
    if (x < 0 || x >= w || y < 0 || y >= h) continue;

    let idx = y * w + x;
    if (visited[idx]) continue;

    const pIdx = idx * 4;
    if (!matches(pIdx)) continue;

    // Scan left
    let lx = x;
    while (lx > 0 && matches(((y * w) + lx - 1) * 4) && !visited[y * w + lx - 1]) lx--;

    // Scan right
    let rx = x;
    while (rx < w - 1 && matches(((y * w) + rx + 1) * 4) && !visited[y * w + rx + 1]) rx++;

    // Fill scanline
    for (let i = lx; i <= rx; i++) {
      const fi = y * w + i;
      visited[fi] = 1;
      setPixel(fi * 4);

      // Check above and below
      if (y > 0 && !visited[(y - 1) * w + i] && matches(((y - 1) * w + i) * 4)) stack.push([i, y - 1]);
      if (y < h - 1 && !visited[(y + 1) * w + i] && matches(((y + 1) * w + i) * 4)) stack.push([i, y + 1]);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function hexToRgb(hex) {
  if (!hex) return null;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// ======================================
// ROUND STARTED
// ======================================
socket.on("roundStarted", ({ round, totalRounds, drawerId, drawerName }) => {
  currentDrawerId = drawerId;
  document.getElementById("roundInfo").innerText = `Round ${round}/${totalRounds || "?"}`;
  document.getElementById("drawerName").innerText = drawerName;
  document.getElementById("timer").innerText = "0";

  // Clear canvas
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  undoStack = [];

  // Reset word display
  const wordDisplay = document.getElementById("wordDisplay");
  wordDisplay.innerText = "SKRIBBL";
  wordDisplay.style.letterSpacing = "5px";

  // Hide word choice popup
  const wordBox = document.getElementById("wordChoices");
  if (wordBox) wordBox.style.display = "none";

  // Am I the drawer?
  canDraw = socket.id === drawerId;
  const tools = document.getElementById("tools");
  const status = document.getElementById("status");

  if (canDraw) {
    tools.style.display = "flex";
    status.innerText = "YOU DRAW!";
    status.className = "drawing";
    // Reset tool state
    selectPen();
    setColor("#000");
    document.getElementById("brushSlider").value = 3;
    setBrushSize(3);
  } else {
    tools.style.display = "none";
    status.innerText = "GUESS!";
    status.className = "guessing";
  }

  renderScoreboard(playersData.length ? playersData : []);
});

// ======================================
// WORD CHOICES (Drawer)
// ======================================
socket.on("chooseWord", ({ choices }) => {
  const box = document.getElementById("wordChoices");
  if (!box) return;

  box.style.display = "flex";
  let timeLeft = 15;

  if (box._timerId) clearInterval(box._timerId);

  box.innerHTML =
    `<h3>Choose a Word (<span id="choiceTimer">${timeLeft}</span>s)</h3>
     <div class="word-choices-container">
       ${choices.map(w => `<button class="wordBtn">${escapeHtml(w)}</button>`).join("")}
     </div>`;

  box._timerId = setInterval(() => {
    timeLeft--;
    const el = document.getElementById("choiceTimer");
    if (el) el.innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(box._timerId);
      box.style.display = "none";
    }
  }, 1000);

  document.querySelectorAll(".wordBtn").forEach(btn => {
    btn.onclick = () => {
      clearInterval(box._timerId);
      box.style.display = "none";
      socket.emit("drawerChosenWord", { roomId: ROOM, word: btn.innerText });
    };
  });
});

// ======================================
// WORD CHOSEN → TIMER
// ======================================
let timerInterval = null;

socket.on("wordChosen", ({ guessTime, maskedWord, word, drawerId }) => {
  if (timerInterval) clearInterval(timerInterval);

  let t = guessTime;
  const timerEl = document.getElementById("timer");
  const timerWrap = document.getElementById("timerWrap");
  timerEl.innerText = t;

  const display = document.getElementById("wordDisplay");

  if (socket.id == drawerId) {
    display.innerText = word;
    display.style.letterSpacing = "2px";
  } else {
    display.innerText = maskedWord.split("").join(" ");
    display.style.letterSpacing = "5px";
  }

  timerInterval = setInterval(() => {
    t--;
    timerEl.innerText = Math.max(0, t);
    timerWrap.classList.toggle("warning", t <= 10 && t > 0);
    if (t <= 0) {
      clearInterval(timerInterval);
      timerWrap.classList.remove("warning");
    }
  }, 1000);
});

// ======================================
// HINT UPDATES
// ======================================
socket.on("updateMaskedWord", (maskedWord) => {
  const display = document.getElementById("wordDisplay");
  // Only update for guessers (drawer sees full word)
  if (!canDraw) {
    display.innerText = maskedWord.split("").join(" ");
    showToast("💡 Hint revealed!", "warning", 1500);
  }
});

// ======================================
// CHAT
// ======================================
function sendChat() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("chatMessage", { roomId: ROOM, message: text });
  input.value = "";
  input.focus();
}

document.getElementById("chatInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") { e.preventDefault(); sendChat(); }
});

socket.on("chatMessage", ({ from, text, avatar, isPrivate }) => {
  const cls = isPrivate ? "private-msg" : "";
  const prefix = isPrivate ? "🔒 " : "";
  addChatMessage(`${prefix}${avatar || ""} <b>${escapeHtml(from)}:</b> ${escapeHtml(text)}`, cls);
});

socket.on("correctGuess", ({ playerName, points, avatar }) => {
  addChatMessage(`🎉 ${avatar || ""} ${escapeHtml(playerName)} guessed it! +${points}`, "correct-msg");
  showToast(`${playerName} guessed correctly! +${points}`, "success", 2000);
});

socket.on("systemMessage", ({ text }) => {
  addChatMessage(text, "system-msg");
});

function addChatMessage(html, cls = "") {
  const div = document.createElement("div");
  if (cls) div.className = cls;
  div.innerHTML = html;
  const msgs = document.getElementById("messages");
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;

  // Limit chat messages to prevent memory issues
  while (msgs.children.length > 200) msgs.removeChild(msgs.firstChild);
}

// ======================================
// ROUND ENDED
// ======================================
socket.on("roundEnded", ({ word, players }) => {
  if (timerInterval) clearInterval(timerInterval);
  playersData = players;

  addChatMessage(`⏳ Round ended! The word was: <b>${escapeHtml(word || "???")}</b>`, "round-end-msg");

  const display = document.getElementById("wordDisplay");
  display.innerText = word || "???";
  display.style.letterSpacing = "2px";

  document.getElementById("timer").innerText = "0";
  document.getElementById("timerWrap").classList.remove("warning");

  canDraw = false;
  drawing = false;
  document.getElementById("tools").style.display = "none";

  renderScoreboard(players);
});

// ======================================
// GAME OVER
// ======================================
socket.on("gameOver", ({ players }) => {
  if (timerInterval) clearInterval(timerInterval);

  const overlay = document.getElementById("gameOverOverlay");
  const sb = document.getElementById("finalScoreboard");

  players.sort((a, b) => b.score - a.score);

  const medals = ["🥇", "🥈", "🥉"];

  sb.innerHTML = players.map((p, i) => {
    const medal = medals[i] || "";
    const crown = i === 0 ? '<span class="winner-badge">👑</span>' : '';
    return `
      <div class="final-player-row">
        <span>${medal} ${crown}${p.avatar || ""} ${escapeHtml(p.name)}</span>
        <span>${p.score}</span>
      </div>`;
  }).join("");

  overlay.style.display = "flex";
});

// ======================================
// KICKED
// ======================================
socket.on("kicked", ({ reason }) => {
  const overlay = document.createElement("div");
  overlay.className = "kicked-overlay";
  overlay.innerHTML = `
    <h2>😢 KICKED</h2>
    <p>${escapeHtml(reason || "You were removed from the game.")}</p>
    <button class="btn" onclick="location.href='index.html'">Back to Home</button>
  `;
  document.body.appendChild(overlay);
  localStorage.removeItem("roomId");
  localStorage.removeItem("playerToken");
});

// ======================================
// JOIN ROOM
// ======================================
socket.emit("joinRoom", {
  roomId: ROOM,
  name: NAME,
  avatar: AVATAR,
  token: TOKEN
}, (res) => {
  if (!res) { alert("Connection error"); location.href = "index.html"; return; }
  if (!res.ok) { alert(res.err || "Failed to join"); location.href = "index.html"; return; }
  if (res.token) { TOKEN = res.token; localStorage.setItem("playerToken", TOKEN); }
  if (res.room) {
    playersData = res.room.players;
    renderScoreboard(res.room.players);
  }
});

// ======================================
// RECONNECTION
// ======================================
socket.on("connect", () => {
  // Re-join on reconnect
  socket.emit("joinRoom", { roomId: ROOM, name: NAME, avatar: AVATAR, token: TOKEN }, (res) => {
    if (!res || !res.ok) return;
    if (res.token) { TOKEN = res.token; localStorage.setItem("playerToken", TOKEN); }
    if (res.room) { playersData = res.room.players; renderScoreboard(res.room.players); }
  });
});

socket.on("disconnect", () => {
  showToast("Disconnected... reconnecting", "error", 3000);
});
