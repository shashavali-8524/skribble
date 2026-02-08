# Skribbl - Draw & Guess Multiplayer Game

A real-time multiplayer drawing and guessing game inspired by Skribbl.io, built with **Node.js**, **Express**, and **Socket.IO**. Create private rooms, draw on a shared canvas, and guess what others are drawing — all from your browser.

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## Features

### Core Gameplay
- **Private Rooms** — Create password-free rooms with a 5-character code and invite friends via link
- **Real-time Drawing** — HTML5 Canvas with synchronized drawing across all players
- **Word Guessing** — Type guesses in chat; correct guesses earn points based on speed
- **Multi-round System** — Configurable rounds (1–15), each player takes a turn drawing
- **Scoring** — Time-based scoring with bonus for first correct guesser; drawer earns points per correct guess

### Drawing Tools
- **13 Colors** — Full palette including black, grays, red, orange, yellow, green, teal, blue, purple, pink, brown, white
- **Brush Size Slider** — Adjustable from 1px to 30px
- **Pen & Eraser** — Quick toggle between drawing and erasing
- **Bucket Fill** — Scanline flood fill algorithm for fast area fills
- **Undo** — 30 levels of undo with canvas state snapshots
- **Clear Canvas** — One-click reset

### Multiplayer Features
- **Lobby System** — See all players, room settings, and chat before game starts
- **Host Controls** — Only the host can start the game and kick players
- **Kick Player** — Remove disruptive players (host only)
- **Copy Invite Link** — 3-tier clipboard fallback (Clipboard API → execCommand → prompt)
- **Reconnection** — 12-second grace period on disconnect; rejoin with token-based identity
- **Skribbl-style Chat** — Drawer and already-guessed players can chat privately (hidden from guessers)

### Smart Game Logic
- **Close Guess Detection** — Levenshtein distance alerts when you're close ("So close! 🔥")
- **Progressive Hints** — Letters revealed at 50% and 75% of round time
- **Auto Word Selection** — If drawer doesn't pick a word in 15s, one is chosen randomly
- **Duplicate Name Prevention** — Can't join with a name already in the room
- **Word Bank** — 2,337 curated words loaded from CSV

### Mobile-First Design
- **Responsive Layout** — Breakpoints at 1024px, 768px, 480px + landscape mode
- **Touch Drawing** — Proper coordinate scaling with `getBoundingClientRect()`
- **No Zoom** — Viewport meta prevents unwanted zoom on input focus
- **Touch Action** — `touch-action: none` on canvas prevents scroll interference

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Server** | Node.js + Express 5.1 |
| **Real-time** | Socket.IO 4.8.1 |
| **Client** | Vanilla JavaScript, HTML5 Canvas |
| **Styling** | CSS3 with custom properties, Nunito font |
| **Deployment** | Render (render.yaml included) |

---

## Quick Start

### Prerequisites
- **Node.js** v18+ (tested on v22)
- **npm** (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/skribbl.git
cd skribbl

# Install dependencies
npm install

# Start the server
npm start
```

Open **http://localhost:3000** in your browser.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |

---

## Project Structure

```
skribbl/
├── server.js              # Express server + Socket.IO game logic
├── package.json           # Dependencies and scripts
├── render.yaml            # Render.com deployment config
├── Skribbl-words.csv      # Word bank (2,337 words)
├── README.md              # This file
├── CONTRIBUTING.md         # Contribution guidelines
└── public/                # Static client files
    ├── index.html         # Home page (name + avatar selection)
    ├── create.html        # Room creation form
    ├── join.html          # Join room by code or link
    ├── lobby.html         # Pre-game lobby (players, chat, settings)
    ├── game.html          # Main game page (canvas, chat, scoreboard)
    ├── app.js             # Client-side game logic (~700 lines)
    └── style.css          # Complete responsive stylesheet (~1080 lines)
```

---

## How It Works

### Game Flow

```
index.html → create.html → lobby.html → game.html
                 or
index.html → join.html → lobby.html → game.html
```

1. **Home** — Enter name, pick avatar
2. **Create/Join** — Host creates a room (gets code) or player joins via code/link
3. **Lobby** — Players gather, host configures rounds/time, chat available
4. **Game** — Rounds cycle through each player as drawer:
   - Drawer picks 1 of 3 random words (15s timeout)
   - Others guess by typing in chat
   - Hints progressively revealed
   - Round ends when all guess or time runs out
5. **Game Over** — Final scoreboard with medals

### Socket Events Reference

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `createRoom` | `{ name, avatar, settings }` | Create a new room |
| `joinRoom` | `{ roomId, name, avatar, token }` | Join or reconnect to room |
| `startGame` | `{ roomId }` | Host starts game |
| `drawerChosenWord` | `{ roomId, word }` | Drawer picks a word |
| `drawingData` | `{ roomId, data }` | Drawing stroke data |
| `clearCanvas` | `{ roomId }` | Clear canvas |
| `bucketFill` | `{ roomId, x, y, color }` | Flood fill action |
| `undoAction` | `{ roomId }` | Undo last stroke |
| `chatMessage` | `{ roomId, message }` | Send chat/guess |
| `kickPlayer` | `{ roomId, playerId }` | Kick a player (host) |
| `checkRoom` | `{ roomId }` | Check if room exists |

#### Server → Client

| Event | Description |
|-------|-------------|
| `roomUpdate` | Full room state (players, settings) |
| `roundStarted` | New round info (drawer, round number) |
| `chooseWord` | Send word choices to drawer |
| `wordChosen` | Word was selected, timer starts |
| `drawingData` | Relay drawing to other players |
| `clearCanvas` | Relay canvas clear |
| `bucketFill` | Relay flood fill |
| `undoAction` | Relay undo |
| `chatMessage` | Chat message (with `isPrivate` flag) |
| `correctGuess` | Player guessed correctly |
| `systemMessage` | System notification |
| `updateScores` | Updated player scores |
| `updateMaskedWord` | New hint revealed |
| `roundEnded` | Round over, reveal word |
| `gameOver` | Game finished, final scores |
| `kicked` | Player was kicked |

---

## Room Settings

| Setting | Range | Default |
|---------|-------|---------|
| Rounds | 1 – 15 | 3 |
| Max Players | 2 – 20 | 6 |
| Guess Time | 20s – 180s | 60s |

---

## Deployment

### Render (Included)

The project includes a `render.yaml` for one-click deployment on [Render](https://render.com):

```bash
# Just push to your repo connected to Render
git push origin main
```

### Other Platforms

Works on any Node.js hosting (Railway, Fly.io, Heroku, VPS):

```bash
# Set PORT environment variable if needed
PORT=8080 npm start
```

---

## Scoring System

| Action | Points |
|--------|--------|
| Correct guess | 50–400 (time-based) |
| First correct guess bonus | +150 |
| Drawer bonus (per guesser) | +30 |

Formula: `points = max(50, floor((timeRemaining / totalTime) * 400))`

---

## Browser Support

- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+
- Mobile Safari (iOS 14+)
- Chrome Mobile (Android 8+)

---

## Known Limitations

- **Undo sync** — Undo only works for the drawer; other players see the restored state on next stroke
- **No persistent storage** — Rooms exist only in memory; server restart clears everything
- **Single server** — No horizontal scaling (Socket.IO sticky sessions would be needed)

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Author

**Shasha Vali** — [LinkedIn](https://www.linkedin.com/in/shasha-vali-ab539428a/)
