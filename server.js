// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server on", PORT));

/* ======================================
   ROOMS STORAGE
====================================== */
const rooms = {};
const roomTimers = {};
const disconnectTimers = {};

/* ======================================
   ROOM ID GENERATOR
====================================== */
function generateRoomID(len = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < len; i++)
    id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/* ======================================
   CREATE ROOM
====================================== */
function createRoom(socketId, name, avatar, settings) {
  let id;
  do { id = generateRoomID(); } while (rooms[id]);

  const token = crypto.randomUUID();

  rooms[id] = {
    id,
    host: socketId,
    settings,
    players: [{
      id: socketId,
      name,
      avatar: avatar || "😐",
      score: 0,
      socketId,
      token,
      guessed: false
    }],
    currentRound: 1,
    currentDrawerIndex: 0,
    currentWord: null,
    maskedWord: null,
    roundActive: false,
    guessEndTime: null,
    gameStarted: false,
    order: []
  };

  roomTimers[id] = {
    roundTimer: null,
    hintTimer1: null,
    hintTimer2: null,
    wordSelectTimer: null
  };

  return rooms[id];
}

/* ======================================
   WORD LIST
====================================== */
const fs = require("fs");
const path = require("path");

let WORDS = ["apple", "tiger", "rocket", "train", "sunflower", "bicycle", "phone", "tree",
  "chair", "car", "computer", "dolphin", "guitar", "pizza", "rainbow", "castle",
  "elephant", "butterfly", "mountain", "umbrella", "penguin", "volcano", "treasure",
  "spaceship", "dinosaur", "waterfall", "fireworks", "lighthouse", "parachute", "telescope"];

try {
  const wordsPath = path.join(__dirname, "Skribbl-words.csv");
  if (fs.existsSync(wordsPath)) {
    const fileContent = fs.readFileSync(wordsPath, "utf-8");
    const lines = fileContent.split("\n");
    const fileWords = [];
    for (let line of lines) {
      if (!line.trim()) continue;
      const word = line.split(",")[0].trim();
      if (word.length > 0 && word.toLowerCase() !== "word") fileWords.push(word);
    }
    if (fileWords.length > 0) {
      WORDS = fileWords;
      console.log(`Loaded ${WORDS.length} words from Skribbl-words.csv`);
    }
  }
} catch (err) {
  console.log("Error loading words:", err.message);
}

/* ======================================
   HELPERS
====================================== */
function resetRoundFlags(room) {
  room.players.forEach(p => p.guessed = false);
}

function clearAllTimers(roomId) {
  const t = roomTimers[roomId];
  if (!t) return;
  clearTimeout(t.roundTimer);
  clearTimeout(t.hintTimer1);
  clearTimeout(t.hintTimer2);
  clearTimeout(t.wordSelectTimer);
  t.roundTimer = t.hintTimer1 = t.hintTimer2 = t.wordSelectTimer = null;
}

function removePlayer(roomId, playerId) {
  const room = rooms[roomId];
  if (!room) return;

  const wasDrawer = room.order.length > 0 &&
    room.order[room.currentDrawerIndex % room.order.length] === playerId;

  const removed = room.players.find(p => p.id === playerId);
  room.players = room.players.filter(pl => pl.id !== playerId);
  room.order = room.players.map(pl => pl.id);

  if (room.host === playerId && room.players.length > 0) {
    room.host = room.players[0].id;
    io.to(roomId).emit("systemMessage", { text: `${room.players[0].name} is now the host.` });
  }

  io.to(roomId).emit("roomUpdate", room);
  if (removed) io.to(roomId).emit("systemMessage", { text: `${removed.name} left the room.` });

  if (room.players.length === 0) {
    clearAllTimers(roomId);
    delete rooms[roomId];
    delete roomTimers[roomId];
    return;
  }

  if (wasDrawer && room.roundActive) endRound(roomId);
}

function levenshtein(a, b) {
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++)
      m[i][j] = b[i - 1] === a[j - 1] ? m[i - 1][j - 1] :
        Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
  return m[b.length][a.length];
}

function isCloseGuess(guess, word) {
  const g = guess.toLowerCase(), w = word.toLowerCase();
  if (g === w || Math.abs(g.length - w.length) > 2) return false;
  return levenshtein(g, w) <= 2;
}

/* ======================================
   HANDLE WORD CHOICE
====================================== */
function handleWordChoice(roomId, word) {
  const room = rooms[roomId];
  const timers = roomTimers[roomId];
  if (!room || !timers) return;

  if (timers.wordSelectTimer) { clearTimeout(timers.wordSelectTimer); timers.wordSelectTimer = null; }

  room.currentWord = word;
  room.wordChoices = null;
  room.guessEndTime = Date.now() + room.settings.guessTime * 1000;
  resetRoundFlags(room);

  room.maskedWord = word.replace(/[a-zA-Z]/g, "_");
  const drawerId = room.order[room.currentDrawerIndex % room.order.length];

  io.to(roomId).emit("wordChosen", {
    drawerId, guessTime: room.settings.guessTime, maskedWord: room.maskedWord, word
  });

  const gt = room.settings.guessTime;
  timers.hintTimer1 = setTimeout(() => revealHint(roomId), (gt / 2) * 1000);
  timers.hintTimer2 = setTimeout(() => revealHint(roomId), (gt * 0.75) * 1000);
  timers.roundTimer = setTimeout(() => endRound(roomId), gt * 1000);
}

function revealHint(roomId) {
  const room = rooms[roomId];
  if (!room || !room.currentWord) return;
  const word = room.currentWord;
  const masked = room.maskedWord.split("");
  const indices = [];
  for (let i = 0; i < word.length; i++) if (masked[i] === "_") indices.push(i);
  if (indices.length > 0) {
    const ri = indices[Math.floor(Math.random() * indices.length)];
    masked[ri] = word[ri];
    room.maskedWord = masked.join("");
    io.to(roomId).emit("updateMaskedWord", room.maskedWord);
  }
}

/* ======================================
   ROUND MANAGEMENT
====================================== */
function startRound(roomId) {
  const room = rooms[roomId];
  const timers = roomTimers[roomId];
  if (!room || !timers) return;

  if (room.players.length < 2) {
    io.to(roomId).emit("systemMessage", { text: "Need at least 2 players to continue!" });
    room.gameStarted = false;
    room.roundActive = false;
    return;
  }

  if (room.currentRound > room.settings.rounds) {
    io.to(roomId).emit("gameOver", { players: room.players });
    clearAllTimers(roomId);
    room.gameStarted = false;
    room.roundActive = false;
    room.currentRound = 1;
    room.currentDrawerIndex = 0;
    room.currentWord = null;
    room.players.forEach(p => { p.score = 0; p.guessed = false; });
    return;
  }

  resetRoundFlags(room);
  room.roundActive = true;
  room.order = room.players.map(p => p.id);

  const drawerId = room.order[room.currentDrawerIndex % room.order.length];
  const drawer = room.players.find(p => p.id === drawerId);

  if (!drawer) {
    room.currentDrawerIndex++;
    if (room.currentDrawerIndex > room.players.length * room.settings.rounds * 2) return;
    return startRound(roomId);
  }

  const choices = [];
  const used = new Set();
  while (choices.length < 3 && used.size < WORDS.length) {
    const idx = Math.floor(Math.random() * WORDS.length);
    if (!used.has(idx)) { used.add(idx); choices.push(WORDS[idx]); }
  }
  room.wordChoices = choices;

  io.to(roomId).emit("roundStarted", {
    round: room.currentRound,
    totalRounds: room.settings.rounds,
    drawerId: drawer.id,
    drawerName: drawer.name
  });

  setTimeout(() => {
    if (!rooms[roomId]) return;
    io.to(drawer.socketId).emit("chooseWord", { choices });
    timers.wordSelectTimer = setTimeout(() => {
      if (room.wordChoices && room.wordChoices.length > 0) {
        handleWordChoice(roomId, room.wordChoices[Math.floor(Math.random() * room.wordChoices.length)]);
      }
    }, 15000);
  }, 200);
}

function endRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  clearAllTimers(roomId);

  io.to(roomId).emit("roundEnded", { word: room.currentWord || "???", players: room.players });

  room.currentDrawerIndex++;
  if (room.order.length > 0 && room.currentDrawerIndex % room.order.length === 0) room.currentRound++;
  room.currentWord = null;
  room.roundActive = false;

  setTimeout(() => {
    if (rooms[roomId]) {
      room.roundActive = true;
      startRound(roomId);
    }
  }, 3500);
}

/* ======================================
   SOCKET.IO CONNECTIONS
====================================== */
io.on("connection", socket => {

  // CREATE ROOM
  socket.on("createRoom", ({ name, avatar, settings }, cb) => {
    if (!cb) return;
    if (!name || !settings) return cb({ ok: false, err: "Invalid data" });
    settings.rounds = Math.min(Math.max(Number(settings.rounds) || 3, 1), 15);
    settings.maxPlayers = Math.min(Math.max(Number(settings.maxPlayers) || 6, 2), 20);
    settings.guessTime = Math.min(Math.max(Number(settings.guessTime) || 60, 20), 180);

    const room = createRoom(socket.id, name, avatar, settings);
    socket.join(room.id);
    room.order = room.players.map(p => p.id);
    cb({ ok: true, roomId: room.id, token: room.players[0].token });
    io.to(room.id).emit("roomUpdate", room);
  });

  // JOIN ROOM
  socket.on("joinRoom", ({ roomId, name, avatar, token }, cb) => {
    if (!cb) return;
    const id = (roomId || "").toUpperCase().trim();
    const room = rooms[id];
    if (!room) return cb({ ok: false, err: "Room not found" });

    const dcKey = `${id}_${token}`;
    if (disconnectTimers[dcKey]) { clearTimeout(disconnectTimers[dcKey]); delete disconnectTimers[dcKey]; }

    const existing = token ? room.players.find(p => p.token === token) : null;

    if (existing) {
      const oldId = existing.id;
      if (room.host === oldId) room.host = socket.id;
      existing.id = socket.id;
      existing.socketId = socket.id;
      if (name) existing.name = name;
      if (avatar) existing.avatar = avatar;
      const oi = room.order.indexOf(oldId);
      if (oi !== -1) room.order[oi] = socket.id;

      socket.join(id);
      io.to(id).emit("roomUpdate", room);

      if (room.roundActive && room.gameStarted) {
        const drawerId = room.order[room.currentDrawerIndex % room.order.length];
        const drawer = room.players.find(p => p.id === drawerId);
        socket.emit("roundStarted", {
          round: room.currentRound, totalRounds: room.settings.rounds,
          drawerId, drawerName: drawer ? drawer.name : "?"
        });
        if (room.wordChoices && drawerId === socket.id) socket.emit("chooseWord", { choices: room.wordChoices });
        if (room.currentWord) {
          const remaining = Math.max(0, Math.ceil((room.guessEndTime - Date.now()) / 1000));
          socket.emit("wordChosen", { guessTime: remaining, maskedWord: room.maskedWord, word: room.currentWord, drawerId });
        }
      }
      return cb({ ok: true, refreshed: true, room, isHost: room.host === socket.id });
    }

    if (!name) return cb({ ok: false, err: "Name is required" });
    if (room.players.length >= room.settings.maxPlayers) return cb({ ok: false, err: "Room is full" });
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
      return cb({ ok: false, err: "Name already taken" });

    const newToken = crypto.randomUUID();
    room.players.push({
      id: socket.id, name, avatar: avatar || "😐", score: 0,
      socketId: socket.id, token: newToken, guessed: false
    });
    room.order = room.players.map(p => p.id);
    socket.join(id);
    io.to(id).emit("roomUpdate", room);
    io.to(id).emit("systemMessage", { text: `${name} joined!` });
    return cb({ ok: true, refreshed: false, token: newToken, room, isHost: room.host === socket.id });
  });

  // START GAME
  socket.on("startGame", ({ roomId }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb && cb({ ok: false, err: "Room not found" });
    if (socket.id !== room.host) return cb && cb({ ok: false, err: "Only host can start" });
    if (room.players.length < 2) return cb && cb({ ok: false, err: "Need 2+ players" });
    if (room.gameStarted) return cb && cb({ ok: false, err: "Game already running" });
    room.gameStarted = true;
    room.currentRound = 1;
    room.currentDrawerIndex = 0;
    room.players.forEach(p => { p.score = 0; p.guessed = false; });
    startRound(roomId);
    if (typeof cb === "function") cb({ ok: true });
  });

  // DRAWER CHOSE WORD
  socket.on("drawerChosenWord", ({ roomId, word }) => {
    const room = rooms[roomId];
    if (!room) return;
    const drawerId = room.order[room.currentDrawerIndex % room.order.length];
    if (socket.id !== drawerId) return;
    if (room.wordChoices && !room.wordChoices.includes(word)) return;
    handleWordChoice(roomId, word);
  });

  // DRAWING DATA
  socket.on("drawingData", ({ roomId, data }) => {
    const room = rooms[roomId];
    if (!room) return;
    const drawerId = room.order[room.currentDrawerIndex % room.order.length];
    if (socket.id !== drawerId) return;
    socket.to(roomId).emit("drawingData", data);
  });

  socket.on("clearCanvas", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const drawerId = room.order[room.currentDrawerIndex % room.order.length];
    if (socket.id !== drawerId) return;
    socket.to(roomId).emit("clearCanvas");
  });

  socket.on("bucketFill", ({ roomId, x, y, color }) => {
    const room = rooms[roomId];
    if (!room) return;
    const drawerId = room.order[room.currentDrawerIndex % room.order.length];
    if (socket.id !== drawerId) return;
    socket.to(roomId).emit("bucketFill", { x, y, color });
  });

  socket.on("undoAction", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const drawerId = room.order[room.currentDrawerIndex % room.order.length];
    if (socket.id !== drawerId) return;
    socket.to(roomId).emit("undoAction");
  });

  // CHAT / GUESSING (Skribbl-style: drawer & guessed players can chat, but hidden from others)
  socket.on("chatMessage", ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const text = (message || "").trim().substring(0, 200);
    if (!text) return;

    const drawerId = room.order.length > 0 ? room.order[room.currentDrawerIndex % room.order.length] : null;
    const isDrawer = drawerId === socket.id;

    // If game is active and sender is drawer or already guessed → private chat among guessed+drawer
    if (room.currentWord && (isDrawer || player.guessed)) {
      const recipients = room.players.filter(p => p.id === drawerId || p.guessed);
      const payload = { from: player.name, text, avatar: player.avatar, isPrivate: true };
      recipients.forEach(p => io.to(p.socketId).emit("chatMessage", payload));
      return;
    }

    // Normal guessing chat (visible to everyone)
    const isCorrect = room.currentWord && text.toLowerCase() === room.currentWord.toLowerCase();

    if (!isCorrect) {
      if (room.currentWord && isCloseGuess(text, room.currentWord))
        socket.emit("systemMessage", { text: "So close! 🔥" });
      io.to(roomId).emit("chatMessage", { from: player.name, text, avatar: player.avatar });
    }

    // No active word → just regular chat (lobby phase)
    if (!room.currentWord) return;

    if (isCorrect) {
      player.guessed = true;
      const remaining = Math.max(0, Math.ceil((room.guessEndTime - Date.now()) / 1000));
      const total = room.settings.guessTime;
      let points = Math.max(50, Math.floor((remaining / total) * 400));
      const correctCount = room.players.filter(p => p.guessed).length;
      if (correctCount === 1) points += 150;
      player.score += points;

      if (drawerId) {
        const drawer = room.players.find(p => p.id === drawerId);
        if (drawer) drawer.score += 30;
      }

      io.to(roomId).emit("correctGuess", { playerName: player.name, points, avatar: player.avatar });
      io.to(roomId).emit("updateScores", room.players);

      const guessable = room.players.filter(p => p.id !== drawerId);
      if (guessable.every(p => p.guessed)) {
        clearAllTimers(roomId);
        setTimeout(() => endRound(roomId), 1500);
      }
    }
  });

  // KICK PLAYER
  socket.on("kickPlayer", ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.host || playerId === socket.id) return;
    const kicked = room.players.find(p => p.id === playerId);
    if (!kicked) return;
    io.to(kicked.socketId).emit("kicked", { reason: "You were kicked by the host." });
    io.to(roomId).emit("systemMessage", { text: `${kicked.name} was kicked.` });
    removePlayer(roomId, playerId);
  });

  // CHECK ROOM
  socket.on("checkRoom", ({ roomId }, cb) => {
    if (!cb) return;
    const room = rooms[(roomId || "").toUpperCase().trim()];
    if (!room) return cb({ exists: false });
    cb({ exists: true, playerCount: room.players.length, maxPlayers: room.settings.maxPlayers, gameStarted: room.gameStarted });
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    for (const rid in rooms) {
      const room = rooms[rid];
      const p = room.players.find(pl => pl.id === socket.id);
      if (!p) continue;

      const dcKey = `${rid}_${p.token}`;
      disconnectTimers[dcKey] = setTimeout(() => {
        delete disconnectTimers[dcKey];
        const current = room.players.find(pl => pl.token === p.token);
        if (current && current.id === socket.id) removePlayer(rid, socket.id);
      }, 12000);
    }
  });
});
