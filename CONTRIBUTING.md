# Contributing to Skribbl

Thanks for your interest in contributing! This guide will help you get started.

---

## Getting Started

### Prerequisites
- Node.js v18+
- npm
- A modern browser (Chrome, Firefox, Safari, Edge)

### Setup

```bash
git clone https://github.com/yourusername/skribbl.git
cd skribbl
npm install
npm start
```

The server starts at **http://localhost:3000**. Open two browser tabs to test multiplayer.

---

## Architecture Overview

### Server (`server.js`)
Single-file Express server with Socket.IO handling all game logic:
- **Room management** — Create, join, destroy rooms stored in-memory
- **Round lifecycle** — Word selection → drawing → guessing → hints → scoring → next drawer
- **Reconnection** — 12s grace period with UUID token-based identity
- **Chat routing** — Normal chat (broadcast) vs private chat (drawer + guessed players only)

### Client

| File | Purpose |
|------|---------|
| `index.html` | Home — name input, avatar picker |
| `create.html` | Room creation form (rounds, players, time) |
| `join.html` | Join by room code with live validation |
| `lobby.html` | Pre-game lobby (player list, chat, settings, invite link) |
| `game.html` | Game layout (canvas, tools, chat, scoreboard) |
| `app.js` | All client-side logic (canvas, socket events, tools, chat) |
| `style.css` | Complete responsive stylesheet with CSS variables |

### Data Flow

```
Client (browser)  ←→  Socket.IO  ←→  Server (Node.js)
                                        ↕
                                   rooms{} (in-memory)
```

All state lives in the `rooms` object on the server. No database. No sessions. The client uses `localStorage` for session persistence (name, avatar, room ID, token).

---

## How to Add Features

### Adding a New Drawing Tool

1. **`game.html`** — Add a button in the tools row:
   ```html
   <button class="tool-btn" id="myToolBtn" onclick="selectMyTool()">🔧 MyTool</button>
   ```

2. **`app.js`** — Add the tool logic:
   ```javascript
   function selectMyTool() {
     currentTool = "myTool";
     updateToolButtons();
   }
   ```
   Update `updateToolButtons()` to toggle the `.active` class on your button.

3. If the tool emits data, add a socket event in both `app.js` and `server.js`.

### Adding a New Socket Event

1. **Server** (`server.js`) — Add handler inside `io.on("connection", socket => { ... })`:
   ```javascript
   socket.on("myEvent", ({ roomId, data }) => {
     const room = rooms[roomId];
     if (!room) return;
     // Validate and process
     socket.to(roomId).emit("myEvent", data);
   });
   ```

2. **Client** (`app.js`) — Emit and listen:
   ```javascript
   socket.emit("myEvent", { roomId: ROOM, data: ... });
   socket.on("myEvent", (data) => { /* handle */ });
   ```

### Adding a New Page

1. Create `public/mypage.html` — Include viewport meta, stylesheet, socket.io:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1, user-scalable=no">
   <link rel="stylesheet" href="style.css">
   <script src="/socket.io/socket.io.js"></script>
   ```

2. Add `foot` with LinkedIn attribution.

3. No routing changes needed — Express serves all files from `public/` automatically.

### Adding Words

Edit `Skribbl-words.csv` — one word per line. The server reads column 0 of each CSV row:

```
newword1
newword2
another word
```

---

## Code Conventions

### General
- **No frameworks** — Vanilla JS only, no React/Vue/etc.
- **No build step** — Everything runs as-is, no Webpack/Vite
- **CommonJS** — Use `require()` in server.js
- **Single file per concern** — One CSS file, one client JS file, one server file

### JavaScript
- Use `const`/`let`, never `var`
- Arrow functions for callbacks
- Template literals for HTML generation
- Guard clauses (`if (!room) return;`) instead of deep nesting

### CSS
- Use CSS custom properties (e.g., `var(--primary-color)`)
- Mobile-first approach with `@media (max-width: ...)` breakpoints
- BEM-ish class naming (`.player-score`, `.chat-send-btn`)
- Animations via `@keyframes` and `transition`

### HTML
- Every page MUST have the viewport meta tag
- Every page MUST have the footer with attribution
- Use semantic elements where appropriate
- Inline `<script>` for page-specific logic, external for shared (`app.js`)

---

## Testing

No automated test suite yet. Manual testing checklist:

- [ ] Create room → verify room code generated
- [ ] Join room → verify player appears in lobby
- [ ] Start game → verify round starts for all players
- [ ] Draw on canvas → verify all players see drawing
- [ ] Guess word → verify scoring and chat message
- [ ] Close guess → verify "So close!" message
- [ ] Timer expires → verify round ends
- [ ] All players guess → verify early round end
- [ ] Kick player → verify removal
- [ ] Disconnect/reconnect → verify 12s grace period
- [ ] Mobile touch drawing → verify coordinates are correct
- [ ] Copy invite link → verify clipboard
- [ ] Drawer/guessed chat → verify messages only visible to guessed+drawer

---

## Pull Request Guidelines

1. **Fork** the repo and create a branch from `main`
2. **One feature per PR** — Keep changes focused
3. **Test manually** — Run through the checklist above
4. **Describe your changes** — What, why, and how to test
5. **No new dependencies** unless absolutely necessary — the project intentionally has minimal deps

---

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Browser/device info
- Console errors (if any)

---

## Author

**Shasha Vali** — [LinkedIn](https://www.linkedin.com/in/shasha-vali-ab539428a/)
