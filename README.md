# 3D Cricket Batting Game (Meta Display Glasses)

A high-performance 3D Cricket Batting Game built for **Meta Display Glasses (MRBD)** with EMG wristband gesture support, D-pad navigation, and an optional real-time mobile phone bat controller over WebSockets.

## Features
- **Meta Display Glasses Optimized**: Fixed 600x600 resolution viewport, dark mode color palette (`#0a0a0a`), zero-RTT first paint skeleton loader, and 30Hz target render loop.
- **Realistic 3D Cricket Physics**: Overarm bowler deliveries (good length, bouncer, yorker, full toss), lateral swing, seam rotation deviation, bat collision power dynamics, and flying stump physics.
- **Phone Bat Controller**: Use your smartphone as a motion-tracked cricket bat via DeviceOrientation and WebSocket telemetry.
- **PWA & Offline Ready**: Service Worker (`sw.js`) precaching support.
- **1-Over Chase Target**: Continuous 6-ball target chase game mode with max 3 wickets.

## Tech Stack
- HTML5, CSS3, JavaScript (ES Modules / Vanilla)
- [Three.js](https://threejs.org/) (3D rendering & lighting)
- [WebSocket / Node.js](https://github.com/websockets/ws) (Real-time controller server)
- Jest & Babel (Unit testing)

## Project Structure
- `index.html`: Main game interface & overlay UI.
- `controller.html`: Phone motion controller interface.
- `style.css`: Modern high-contrast dark theme & HUD styling.
- `main.js`: 3D scene initialization, lights, render loop, & input handlers.
- `gameEngine.js`: Cricket match state, delivery trajectories, & collision physics.
- `ws-server.js`: Node.js HTTP & WebSocket relay server on port 4000.
- `sw.js`: Service worker for asset precaching and offline support.
- `assets/models/`: 3D models (`bat.gltf`, `bat.bin`).
- `tests/`: Automated unit tests for match logic (`gameEngine.test.js`).

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the game server:
   ```bash
   npm run pad
   # or
   npm run dev
   ```

3. Open in browser:
   - **Game**: [http://localhost:4000](http://localhost:4000)
   - **Phone Controller**: [http://localhost:4000/controller](http://localhost:4000/controller)

4. Run tests & linter:
   ```bash
   npm test
   npm run lint
   ```

## Controls
- **D-Pad / Arrow Keys**: Move bat across the crease.
- **Enter / Tap / EMG Pinch**: Face delivery / serve.
- **Phone Controller**: Hold smartphone like a handle; tilt and swing to hit shots.
