# 3D Ping Pong Game

A 3D Ping Pong game built using **Three.js** for rendering and **Cannon-es** for physics. 

## Features
- **3D Graphics**: Built using Three.js with custom GLTF models for the paddle and the table.
- **Physics**: Real-time physics engine integration using Cannon-es for realistic ball bounces and collisions.
- **Bot Opponent**: Play against a bot that tracks the ball.
- **Dynamic UI**: In-game UI for scores, levels, and user feedback (e.g., "SMASH!" indicator).

## Tech Stack
- HTML, CSS, JavaScript (Vanilla)
- [Three.js](https://threejs.org/) (via CDN)
- [Cannon-es](https://pmndrs.github.io/cannon-es/) (via CDN)
- Jest (for unit testing game logic)

## Project Structure
- `index.html`: The main entry point containing the Three.js setup and UI structure.
- `style.css`: Styles for the in-game UI overlay.
- `main.js`: Handles 3D rendering, scene setup, loading models, user inputs, and the game loop.
- `gameEngine.js`: Contains the core game state and logic (ball movement, collision physics, scoring).
- `assets/`: Contains the 3D models (`paddle.glb` and `table base.glb`).

## How to Play

### Local Development
To run the game locally, you can use any static file server to serve the root directory. For example, if you have Python installed:
```bash
# Using Python 3
python -m http.server 8000
```
Then navigate to `http://localhost:8000` in your browser.

Alternatively, you can use VS Code's "Live Server" extension.

### Controls
- **Click / Tap / Enter**: Serve the ball
- **Arrow Keys** (or W/A/S/D): Move the paddle to hit the ball back to the bot.

## Deployment
This project is configured to be deployed as a static site. You can easily drag and drop the project folder into services like [Vercel](https://vercel.com/) or Netlify. 

*(Note: The static assets are placed in the `assets/` directory to ensure smooth deployment with Vercel).*
