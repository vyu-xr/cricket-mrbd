/**
 * ws-server.js
 * Single HTTP + WebSocket server on port 4000.
 * Compatible with ngrok: `ngrok http 4000`
 *
 * Real-time terminal logging shows both incoming phone sensors AND relay status to Desktop Game.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { execSync }        = require('child_process');
const { WebSocketServer } = require('ws');

// ── Keep the process alive no matter what ────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception (staying alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection (staying alive):', reason);
});

// ── Config ───────────────────────────────────────────────────────────────────
const PORT     = 4000;
const ROOT_DIR = __dirname;

// ── Local IP ─────────────────────────────────────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces))
    for (const iface of ifaces[name])
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
  return '127.0.0.1';
}
const LOCAL_IP = getLocalIP();

// ── MIME types ────────────────────────────────────────────────────────────────
const MIME = {
  '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.glb':'model/gltf-binary', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon',
};

const httpServer = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    urlPath = req.url.split('?')[0];
  }

  if (urlPath === '/' || urlPath === '/index.html') {
    urlPath = '/index.html';
  } else if (urlPath === '/controller' || urlPath === '/controller.html') {
    urlPath = '/controller.html';
  }
  const filePath = path.join(ROOT_DIR, urlPath);
  if (!filePath.startsWith(ROOT_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + urlPath); return; }
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
});

// ── Shared relay state & Terminal Sensor Logging ─────────────────────────────
let gameClient = null;
let padClient  = null;

let lastLogTime = 0;

function safeSend(ws, data) {
  if (ws && ws.readyState === ws.OPEN)
    ws.send(typeof data === 'string' ? data : JSON.stringify(data));
}

function logSensorData(msg, relayedToGame) {
  const now = Date.now();
  const statusTag = relayedToGame ? '✅ SENT TO GAME' : '⚠️ NO GAME CONNECTED';

  if (msg.type === 'orient') {
    if (now - lastLogTime > 350) {
      const pitch = (msg.beta ?? 0).toFixed(1);
      const roll  = (msg.gamma ?? 0).toFixed(1);
      const yaw   = (msg.alpha ?? 0).toFixed(1);
      console.log(`[SENSOR 📱] Pitch(β): ${pitch.padStart(6)}° | Roll(γ): ${roll.padStart(6)}° | Yaw(α): ${yaw.padStart(6)}° → [${statusTag}]`);
      lastLogTime = now;
    }
  } else if (msg.type === 'smash') {
    console.log(`\n💥 [SENSOR EVENT] SMASH DETECTED! Wrist flick → [${statusTag}] 💥\n`);
  } else if (msg.type === 'tap') {
    console.log(`🏓 [SENSOR EVENT] SCREEN TAP -> Serve ball → [${statusTag}]`);
  }
}

const wss = new WebSocketServer({ server: httpServer });

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️  Port ${PORT} busy — clearing old process…`);
    try { execSync(`lsof -ti :${PORT} | xargs kill -9 2>/dev/null || true`); } catch {}
  }
});

wss.on('connection', (ws) => {
  ws.once('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { ws.close(); return; }

    if (msg.role === 'game') {
      if (gameClient) gameClient.close(1000, 'Replaced');
      gameClient = ws;
      console.log('\n🖥  [WS SUCCESS] Desktop Game connected!\n');
      safeSend(ws, { type: 'server', status: 'game_registered', padConnected: padClient !== null });
      safeSend(padClient, { type: 'server', status: 'game_connected' });

      ws.on('message', (d) => safeSend(padClient, d.toString()));
      ws.on('close', () => {
        console.log('🖥  [WS] Desktop Game disconnected');
        gameClient = null;
        safeSend(padClient, { type: 'server', status: 'game_disconnected' });
      });

    } else if (msg.role === 'pad') {
      if (padClient) padClient.close(1000, 'Replaced');
      padClient = ws;
      console.log('\n📱 [WS SUCCESS] Phone Pad connected!\n');
      safeSend(ws, { type: 'server', status: 'pad_registered', gameConnected: gameClient !== null });
      safeSend(gameClient, { type: 'server', status: 'pad_connected' });

      ws.on('message', (data) => {
        const rawStr = data.toString();
        const hasGame = gameClient !== null && gameClient.readyState === 1; // 1 = OPEN
        try {
          const parsed = JSON.parse(rawStr);
          logSensorData(parsed, hasGame);
        } catch {}

        if (hasGame) {
          safeSend(gameClient, rawStr);
        }
      });

      ws.on('close', () => {
        console.log('📱 [WS] Phone Pad disconnected');
        padClient = null;
        safeSend(gameClient, { type: 'server', status: 'pad_disconnected' });
      });

    } else {
      ws.close(1002, 'Unknown role');
    }
  });
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️  Port ${PORT} busy — clearing old process…`);
    try { execSync(`lsof -ti :${PORT} | xargs kill -9 2>/dev/null || true`); } catch {}
    setTimeout(() => httpServer.listen(PORT, '0.0.0.0', onReady), 1500);
  } else {
    console.error('[Server] HTTP error:', err.message);
  }
});

function onReady() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║               🏓  PingPong Server + Ngrok                     ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  🖥  Local Game  : http://localhost:${PORT}                       ║`);
  console.log(`║  📱 Local Phone : http://${LOCAL_IP}:${PORT}/controller            ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  🚀 To expose with Ngrok (for valid HTTPS sensors):          ║');
  console.log(`║     Run in a separate terminal: ngrok http ${PORT}             ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
}

httpServer.listen(PORT, '0.0.0.0', onReady);
