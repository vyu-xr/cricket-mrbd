import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gameEngine } from './gameEngine.js';

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
// Glasses panel is exactly 600x600 — no HDPI scaling needed; pin to 1 saves fill rate
renderer.setPixelRatio(1);
renderer.setSize(600, 600);
renderer.setClearColor(0x000000, 0); // transparent canvas clear
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.BasicShadowMap; // cheapest shadow; PCFSoft costs ~2x
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

// ── Scene & Camera ───────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
scene.background = null;
scene.fog = null;

// Camera: slightly elevated side view of the pitch
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 3.5, 7.5);
camera.lookAt(0, 0.2, 0);

// ── Lighting ─────────────────────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

// Stadium floodlights (cool white)
const flood1 = new THREE.DirectionalLight(0xfff8e7, 1.6);
flood1.position.set(-5, 10, 5);
flood1.castShadow = true;
// 512 shadow map halves texture memory and fill cost vs 1024 on ~2GHz CPU
flood1.shadow.mapSize.set(512, 512);
flood1.shadow.camera.near = 0.1;
flood1.shadow.camera.far  = 30;
flood1.shadow.camera.left = -6;
flood1.shadow.camera.right = 6;
flood1.shadow.camera.top  = 6;
flood1.shadow.camera.bottom = -6;
scene.add(flood1);

const flood2 = new THREE.DirectionalLight(0xe8f4ff, 0.9);
flood2.position.set(5, 8, -3);
scene.add(flood2);

// Rim light (amber/gold — sunset feel)
const rimLight = new THREE.PointLight(0xf59e0b, 40, 20);
rimLight.position.set(0, 5, -5);
scene.add(rimLight);

// ── Cricket Pitch (Three.js PlaneGeometry) ────────────────────────────────────
// The pitch runs along Z: bowler end -3, batsman end +3
// Width ~1.6 units
const pitchW = 1.6;
const pitchL = 6.0;
const pitchGeo = new THREE.PlaneGeometry(pitchW, pitchL, 12, 30);
pitchGeo.rotateX(-Math.PI / 2);  // lay flat on XZ plane

// Procedural pitch texture with worn strips
const pitchCanvas = document.createElement('canvas');
pitchCanvas.width  = 256;
pitchCanvas.height = 512;
const ctx = pitchCanvas.getContext('2d');

// Base: sandy clay
const grad = ctx.createLinearGradient(0, 0, 0, 512);
grad.addColorStop(0,   '#c8a97e');
grad.addColorStop(0.3, '#b89468');
grad.addColorStop(0.7, '#b89468');
grad.addColorStop(1,   '#c8a97e');
ctx.fillStyle = grad;
ctx.fillRect(0, 0, 256, 512);

// Worn central strip (lighter)
ctx.fillStyle = 'rgba(210,185,140,0.5)';
ctx.fillRect(80, 0, 96, 512);

// Crease lines (white)
ctx.strokeStyle = '#ffffff';
ctx.lineWidth   = 5;
// Batsman crease (near end - top of canvas in pitch coords)
ctx.beginPath(); ctx.moveTo(20, 40);  ctx.lineTo(236, 40);  ctx.stroke();
// Bowler crease
ctx.beginPath(); ctx.moveTo(20, 472); ctx.lineTo(236, 472); ctx.stroke();
// Popping crease
ctx.beginPath(); ctx.moveTo(20, 70);  ctx.lineTo(236, 70);  ctx.stroke();
ctx.beginPath(); ctx.moveTo(20, 442); ctx.lineTo(236, 442); ctx.stroke();

// Grass grain noise
for (let i = 0; i < 1200; i++) {
    const gx = Math.random() * 256;
    const gy = Math.random() * 512;
    ctx.fillStyle = `rgba(100,80,40,${Math.random() * 0.08})`;
    ctx.fillRect(gx, gy, 1, Math.random() * 4 + 1);
}

const pitchTexture = new THREE.CanvasTexture(pitchCanvas);
pitchTexture.wrapS = THREE.RepeatWrapping;
pitchTexture.wrapT = THREE.RepeatWrapping;

const pitchMat = new THREE.MeshStandardMaterial({
    map:         pitchTexture,
    roughness:   0.88,
    metalness:   0.0,
    color:       0xc8a060,
});
const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
pitchMesh.receiveShadow = true;
pitchMesh.position.y = 0;
scene.add(pitchMesh);

// ── Stumps (batsman end) ─────────────────────────────────────────────────────
function makeStumps(z) {
    const group = new THREE.Group();
    const stumpMat = new THREE.MeshStandardMaterial({ color: 0xf5e6c8, roughness: 0.6 });
    const bailMat  = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.5, metalness: 0.4 });

    for (let i = -1; i <= 1; i++) {
        const geo  = new THREE.CylinderGeometry(0.012, 0.014, 0.72, 8);
        const mesh = new THREE.Mesh(geo, stumpMat);
        mesh.position.set(i * 0.11, 0.36, z);
        mesh.castShadow = true;
        group.add(mesh);
    }
    // Bails
    for (let i = -1; i <= 0; i++) {
        const bGeo  = new THREE.CylinderGeometry(0.009, 0.009, 0.13, 6);
        const bMesh = new THREE.Mesh(bGeo, bailMat);
        bMesh.rotation.z = Math.PI / 2;
        bMesh.position.set((i + 0.5) * 0.11, 0.735, z);
        group.add(bMesh);
    }
    return group;
}

const batsmanStumps = makeStumps(2.75);
scene.add(batsmanStumps);
const bowlerStumps  = makeStumps(-2.75);
scene.add(bowlerStumps);

// ── Stump Flying Physics ──────────────────────────────────────────────────────
const stumpPhysics = [];
batsmanStumps.children.forEach((mesh) => {
    mesh.userData.initialPos = mesh.position.clone();
    mesh.userData.initialRot = mesh.rotation.clone();
    stumpPhysics.push({
        mesh,
        active: false,
        vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0
    });
});

function triggerStumpExplosion(reason) {
    spawnHitParticles(new THREE.Vector3(0, 0.55, 2.75), true);
    spawnHitParticles(new THREE.Vector3(0, 0.35, 2.75), false);

    const isBowled = reason === 'bowled';
    stumpPhysics.forEach((sp, idx) => {
        sp.active = true;
        const isBail = idx >= 3;
        const baseUp   = isBail ? 4.5 : 3.2;
        const baseBack = isBowled ? (isBail ? 4.5 : 3.5) : (isBail ? 2.5 : 1.8);
        const sideDir  = (idx === 0 || idx === 3) ? -1 : (idx === 2 || idx === 4) ? 1 : (Math.random() - 0.5) * 2;

        sp.vy = baseUp   + Math.random() * 2.2;
        sp.vz = baseBack + Math.random() * 2.5;
        sp.vx = sideDir * (0.8 + Math.random() * 1.5);

        sp.rx = (Math.random() - 0.5) * 14;
        sp.ry = (Math.random() - 0.5) * 14;
        sp.rz = (Math.random() - 0.5) * 14;
    });
}

function resetStumps() {
    stumpPhysics.forEach((sp) => {
        sp.active = false;
        sp.vx = 0; sp.vy = 0; sp.vz = 0;
        sp.rx = 0; sp.ry = 0; sp.rz = 0;
        sp.mesh.position.copy(sp.mesh.userData.initialPos);
        sp.mesh.rotation.copy(sp.mesh.userData.initialRot);
    });
}

function updateStumps(dt) {
    const gravity = 9.8;
    stumpPhysics.forEach((sp) => {
        if (!sp.active) return;

        sp.vy -= gravity * dt;
        sp.mesh.position.x += sp.vx * dt;
        sp.mesh.position.y += sp.vy * dt;
        sp.mesh.position.z += sp.vz * dt;

        sp.mesh.rotation.x += sp.rx * dt;
        sp.mesh.rotation.y += sp.ry * dt;
        sp.mesh.rotation.z += sp.rz * dt;

        if (sp.mesh.position.y <= 0.06 && sp.vy < 0) {
            sp.mesh.position.y = 0.06;
            sp.vy = -sp.vy * 0.42;
            sp.vx *= 0.65;
            sp.vz *= 0.65;
            sp.rx *= 0.6;
            sp.ry *= 0.6;
            sp.rz *= 0.6;
            if (Math.abs(sp.vy) < 0.2) {
                sp.vy = 0;
            }
        }
    });
}

// ── Cricket Ball ─────────────────────────────────────────────────────────────
const ballGeo = new THREE.SphereGeometry(0.055, 32, 32);
const ballMat = new THREE.MeshStandardMaterial({
    color:     0xcc2200,
    roughness: 0.45,
    metalness: 0.1,
    emissive:  0x000000,
});
const ballMesh = new THREE.Mesh(ballGeo, ballMat);
ballMesh.castShadow = true;
scene.add(ballMesh);

// Seam line on ball
const seamGeo = new THREE.TorusGeometry(0.056, 0.005, 6, 24);
const seamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
const seam    = new THREE.Mesh(seamGeo, seamMat);
seam.rotation.y = Math.PI / 2;
ballMesh.add(seam);

// ── Ball trail ───────────────────────────────────────────────────────────────
let engineInitialized = false;
const trailPoints = [];
const trailGeo = new THREE.BufferGeometry();
const trailMat = new THREE.LineBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.5 });
const trailLine = new THREE.Line(trailGeo, trailMat);
scene.add(trailLine);

function updateTrail() {
    if (!engineInitialized || !gameEngine.ballActive) {
        trailGeo.setFromPoints([]);
        trailPoints.length = 0;
        return;
    }
    trailPoints.push(ballMesh.position.clone());
    if (trailPoints.length > 24) trailPoints.shift();
    trailGeo.setFromPoints(trailPoints);

    if (gameEngine.isSmashing) {
        trailMat.color.setHex(0xff8800);
        ballMat.emissive.setHex(0x550000);
        ballMat.emissiveIntensity = 0.6;
    } else {
        trailMat.color.setHex(0xff4400);
        ballMat.emissive.setHex(0x000000);
    }
}

// ── Hit Particles ────────────────────────────────────────────────────────────
const hitParticles = [];
const sharedParticleGeo = new THREE.BoxGeometry(0.025, 0.025, 0.025);
const sharedParticleMatNormal = new THREE.MeshBasicMaterial({ color: 0xffffff });
const sharedParticleMatSmash  = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

function spawnHitParticles(pos, isSmash = false) {
    const count = isSmash ? 24 : 10;
    const mat   = isSmash ? sharedParticleMatSmash : sharedParticleMatNormal;
    for (let i = 0; i < count; i++) {
        const pMesh = new THREE.Mesh(sharedParticleGeo, mat);
        pMesh.position.copy(pos);
        const vx = (Math.random() - 0.5) * 3.5;
        const vy = Math.random() * 2.2 + 0.5;
        const vz = (Math.random() - 0.5) * 3.5;
        scene.add(pMesh);
        hitParticles.push({ mesh: pMesh, vel: new THREE.Vector3(vx, vy, vz), life: 1.0 });
    }
}
function updateHitParticles(dt) {
    for (let i = hitParticles.length - 1; i >= 0; i--) {
        const p = hitParticles[i];
        p.life -= dt * 1.8;
        if (p.life <= 0) {
            scene.remove(p.mesh);
            hitParticles.splice(i, 1);
        } else {
            p.mesh.position.addScaledVector(p.vel, dt);
            p.vel.y -= 9 * dt;
            p.mesh.scale.setScalar(p.life);
        }
    }
}

// ── Event Handler ─────────────────────────────────────────────────────────────
function handleGameEvent(eventName, data) {
    if (eventName === 'levelUp') {
        const el = document.getElementById('level-display');
        if (el) el.innerText = data.level;
    } else if (eventName === 'hit') {
        spawnHitParticles(data.pos, data.type === 'bat' && gameEngine.isSmashing);
    } else if (eventName === 'smash') {
        const overlay = document.getElementById('smash-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            void overlay.offsetWidth;
            overlay.classList.add('active');
        }
    } else if (eventName === 'wicket') {
        triggerStumpExplosion(data.reason);
        const overlay = document.getElementById('smash-overlay');
        if (overlay) {
            overlay.textContent = 'WICKET!';
            overlay.style.color = '#ef4444';
            overlay.classList.remove('active');
            void overlay.offsetWidth;
            overlay.classList.add('active');
            setTimeout(() => { overlay.textContent = 'SIX!'; overlay.style.color = '#22c55e'; }, 1200);
        }
    } else if (eventName === 'delivery' || eventName === 'resetGame') {
        resetStumps();
    } else if (eventName === 'runs') {
        if (data.runs >= 4) {
            const overlay = document.getElementById('smash-overlay');
            if (overlay) {
                overlay.textContent = data.runs === 6 ? 'SIX! 🚀' : 'FOUR! ⚡';
                overlay.style.color = data.runs === 6 ? '#22c55e' : '#f59e0b';
                overlay.classList.remove('active');
                void overlay.offsetWidth;
                overlay.classList.add('active');
            }
        }
    } else if (eventName === 'matchWin') {
        showDialog('win', data);
    } else if (eventName === 'matchLose') {
        showDialog('lose', data);
    }
}

// ── Exclusive Dialog Box Management ──────────────────────────────────────────
function showDialog(type, data = {}) {
    const dialog = document.getElementById('exclusive-dialog');
    const icon   = document.getElementById('dialog-icon');
    const title  = document.getElementById('dialog-title');
    const sub    = document.getElementById('dialog-sub');
    const body   = document.getElementById('dialog-body');
    const btn    = document.getElementById('dialog-btn');
    if (!dialog || !title || !btn) return;

    if (type === 'start') {
        if (icon)  icon.innerText  = '🏏';
        title.innerText = '1-OVER CRICKET CHASE';
        if (sub)   sub.innerText   = 'Chase the target runs in 6 continuous deliveries!';
        if (body) {
            body.innerHTML = `
              <div class="dialog-rule">🎯 <strong>TARGET:</strong> Chase random <strong>12 to 24</strong> runs</div>
              <div class="dialog-rule">⚡ <strong>OVERS:</strong> 1 Over (6 Balls continuous)</div>
              <div class="dialog-rule">💥 <strong>LIMIT:</strong> Max 3 Wickets</div>
              <div class="dialog-rule">🎮 <strong>CONTROLS:</strong> D-Pad/Arrow Keys or Phone Bat</div>
            `;
        }
        btn.innerText = 'START MATCH';
    } else if (type === 'win') {
        if (icon)  icon.innerText  = '🏆';
        title.innerText = 'TARGET CHASED!';
        if (sub)   sub.innerText   = 'Outstanding batting! You won the match!';
        if (body) {
            const wktsLeft = 3 - (data.wickets || 0);
            body.innerHTML = `
              <div class="dialog-rule">🏆 <strong>RESULT:</strong> Won by ${wktsLeft} wicket${wktsLeft !== 1 ? 's' : ''}!</div>
              <div class="dialog-rule">📊 <strong>FINAL SCORE:</strong> ${data.runs || 0} Runs</div>
              <div class="dialog-rule">🎯 <strong>TARGET:</strong> ${data.target || 0} Runs</div>
            `;
        }
        btn.innerText = 'PLAY AGAIN';
    } else if (type === 'lose') {
        if (icon)  icon.innerText  = '💥';
        title.innerText = 'MATCH LOST';
        const isAllOut = data.reason === 'allOut';
        if (sub)   sub.innerText   = isAllOut ? 'All wickets down!' : 'Over finished!';
        if (body) {
            const needed = Math.max(0, (gameEngine.target || 0) - (gameEngine.runs || 0));
            body.innerHTML = `
              <div class="dialog-rule">❌ <strong>REASON:</strong> ${isAllOut ? 'All 3 Wickets Lost' : '6 Balls Completed'}</div>
              <div class="dialog-rule">📊 <strong>SCORE:</strong> ${gameEngine.runs || 0}/${gameEngine.wickets || 0} (Target: ${gameEngine.target || 0})</div>
              <div class="dialog-rule">💔 <strong>SHORTFALL:</strong> Needed ${needed} more run${needed !== 1 ? 's' : ''}</div>
            `;
        }
        btn.innerText = 'RETRY MATCH';
    }

    dialog.classList.remove('hidden');
    setTimeout(() => btn.focus(), 50);
}

function hideDialog() {
    const dialog = document.getElementById('exclusive-dialog');
    if (dialog) dialog.classList.add('hidden');
}

(function initDialogEvents() {
    const btn = document.getElementById('dialog-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            hideDialog();
            if (engineInitialized) {
                gameEngine.resetGame();
                gameEngine.resetBall();
            }
        });
    }
})();

// ── Init Engine (called when bat is loaded) ───────────────────────────────────
let bat = null;
let batBaseX = 0, batTargetX = 0;
let batBaseY = 0, batTargetY = 0;

const BAT_LIMIT_X = 0.6;
const BAT_LIMIT_Y = 0.5;
const BAT_SPEED   = 0.1; // much higher sensitivity

let phoneActive = false;
let phoneRotX = 0, phoneRotY = 0, phoneRotZ = 0;

function checkInitEngine() {
    if (bat && !engineInitialized) {
        const ui = {
            targetScore: document.getElementById('bot-score'),
            ballScore:   document.getElementById('level-display'),
            userScore:   document.getElementById('user-score'),
            message:     document.getElementById('message-display'),
        };
        // Pass null for pitch model & botPaddle — engine doesn't need mesh references for those
        gameEngine.init(scene, pitchMesh, bat, null, ballMesh, ui, handleGameEvent);
        engineInitialized = true;
        showDialog('start');
    }
}

// ── Load bat.glb ─────────────────────────────────────────────────────────────
const loader = new GLTFLoader();
loader.load(
    'bat.glb',
    (gltf) => {
        const loadedMesh = gltf.scene;

        // Normalize size and calculate bounds
        const box    = new THREE.Box3().setFromObject(loadedMesh);
        const size   = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale  = 0.60 / maxDim;

        // Offset inner mesh so origin (0,0,0) is at the bottom toe of the bat
        loadedMesh.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
        loadedMesh.scale.setScalar(scale);

        // Parent group acts as bat transform pivot (at toe)
        bat = new THREE.Group();
        bat.add(loadedMesh);

        // Place at batsman's crease with toe touching the pitch surface (y=0.02)
        bat.position.x = 0;
        bat.position.y = 0.02;
        bat.position.z = 2.5;
        bat.rotation.x = -Math.PI / 6;   // backlift stance angle
        bat.rotation.y = Math.PI;          // face bowler

        batBaseX = bat.position.x;
        batTargetX = batBaseX;
        batBaseY = bat.position.y;
        batTargetY = batBaseY;

        loadedMesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        scene.add(bat);
        checkInitEngine();
    },
    undefined,
    (err) => console.error('bat.glb load error:', err)
);

// ── Keyboard & D-Pad Navigation (MRBD Specs) ──────────────────────────────────
const keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
const DPAD_STEP = 0.25;

function getFocusableElements() {
    const visibleDialog  = document.querySelector('#exclusive-dialog:not(.hidden)');
    const visibleOverlay = document.querySelector('#qr-overlay:not(.hidden)');
    const scope = visibleDialog || visibleOverlay || document.getElementById('ui-layer') || document.body;
    return Array.from(scope.querySelectorAll('.focusable, button, input, [tabindex="0"]'))
        .filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && !el.disabled;
        });
}

function moveFocus(direction) {
    const focusables = getFocusableElements();
    if (focusables.length === 0) return;
    const current = document.activeElement;
    let index = focusables.indexOf(current);

    if (index === -1) {
        index = 0;
    } else {
        if (direction === 'ArrowRight' || direction === 'ArrowDown') {
            index = (index + 1) % focusables.length;
        } else if (direction === 'ArrowLeft' || direction === 'ArrowUp') {
            index = (index - 1 + focusables.length) % focusables.length;
        }
    }
    const nextEl = focusables[index];
    if (nextEl) {
        nextEl.focus();
        if (typeof nextEl.scrollIntoView === 'function') {
            nextEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }
}

function navigateBack() {
    const dialog = document.getElementById('exclusive-dialog');
    if (dialog && !dialog.classList.contains('hidden')) {
        return true;
    }
    const qrOverlay = document.getElementById('qr-overlay');
    if (qrOverlay && !qrOverlay.classList.contains('hidden')) {
        if (window.toggleQR) window.toggleQR();
        return true;
    }
    return false;
}

function normalizeKey(e) {
    const k = e.key;
    if (k === 'ArrowLeft'  || k === 'Left'  || e.keyCode === 37) return 'ArrowLeft';
    if (k === 'ArrowRight' || k === 'Right' || e.keyCode === 39) return 'ArrowRight';
    if (k === 'ArrowUp'    || k === 'Up'    || e.keyCode === 38) return 'ArrowUp';
    if (k === 'ArrowDown'  || k === 'Down'  || e.keyCode === 40) return 'ArrowDown';
    return null;
}

function isActionKey(e) {
    const k = e.key;
    return k === 'Enter' || k === ' ' || k === 'Spacebar' ||
           e.keyCode === 13 || e.keyCode === 32;
}

document.addEventListener('keydown', (e) => {
    // Back gesture / Escape key
    if (e.key === 'Escape' || e.keyCode === 27) {
        if (navigateBack()) {
            e.preventDefault();
            return;
        } else {
            history.back();
            e.preventDefault();
            return;
        }
    }

    const dialog = document.getElementById('exclusive-dialog');
    const qrOverlay = document.getElementById('qr-overlay');
    const isOverlayOpen = (dialog && !dialog.classList.contains('hidden')) || (qrOverlay && !qrOverlay.classList.contains('hidden'));

    const nk = normalizeKey(e);
    if (nk) {
        if (isOverlayOpen) {
            moveFocus(nk);
            e.preventDefault();
            return;
        } else {
            keys[nk] = true;
            if (nk === 'ArrowLeft')  batTargetX = Math.max(batBaseX - BAT_LIMIT_X, batTargetX - DPAD_STEP);
            if (nk === 'ArrowRight') batTargetX = Math.min(batBaseX + BAT_LIMIT_X, batTargetX + DPAD_STEP);
            if (nk === 'ArrowUp')    batTargetY = Math.min(batBaseY + BAT_LIMIT_Y, batTargetY + DPAD_STEP);
            if (nk === 'ArrowDown')  batTargetY = Math.max(0.0, batTargetY - DPAD_STEP);
            e.preventDefault();
        }
    }

    // EMG Pinch / Enter activation
    if (isActionKey(e)) {
        const active = document.activeElement;
        if (active && active !== document.body && typeof active.click === 'function') {
            active.click();
            const action = active.getAttribute('data-action');
            if (action === 'face-bowler' && engineInitialized) {
                gameEngine.resetBall();
            }
        } else if (engineInitialized) {
            gameEngine.resetBall();
        }
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    const nk = normalizeKey(e);
    if (nk) { keys[nk] = false; e.preventDefault(); }
});

// Face bowler on message display click
const msgDisplay = document.getElementById('message-display');
if (msgDisplay) {
    msgDisplay.addEventListener('click', () => {
        if (engineInitialized && !phoneActive) gameEngine.resetBall();
    });
}

// Click to serve
document.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.closest && e.target.closest('.focusable')) return;
    if (engineInitialized && !phoneActive) gameEngine.resetBall();
});

// ── Mobile Controller (WebSocket) ─────────────────────────────────────────────
class MobileController {
    constructor(wsUrl) {
        this.wsUrl        = wsUrl;
        this.ws           = null;
        this.connected    = false;
        this.padConnected = false;
        this.neutralBeta  = null;
        this.neutralGamma = null;
        this.neutralAlpha = null;
        this._connect();
    }

    _connect() {
        try {
            this.ws = new WebSocket(this.wsUrl);
        } catch (e) { console.error('[Game WS]', e); return; }

        this.ws.onopen = () => {
            this.connected = true;
            this.ws.send(JSON.stringify({ role: 'game' }));
        };
        this.ws.onmessage = (evt) => {
            let msg; try { msg = JSON.parse(evt.data); } catch { return; }
            this._handleMsg(msg);
        };
        this.ws.onclose = () => {
            this.connected = false; this.padConnected = false; phoneActive = false;
            this._updatePadUI(false);
            setTimeout(() => this._connect(), 3000);
        };
        this.ws.onerror = () => this.ws.close();
    }

    _handleMsg(msg) {
        if (msg.type === 'server') {
            if (msg.status === 'game_registered' && msg.padConnected) this._onPadConnected();
            else if (msg.status === 'pad_connected') this._onPadConnected();
            else if (msg.status === 'pad_disconnected') {
                this.padConnected = false; phoneActive = false;
                this._updatePadUI(false); phoneRotX = phoneRotY = phoneRotZ = 0;
            }
            return;
        }
        if (!this.padConnected) this._onPadConnected();
        if (msg.type === 'orient') this._onOrient(msg);
        else if (msg.type === 'recalibrate') this._onRecalibrate(msg);
        else if (msg.type === 'tap' && engineInitialized) gameEngine.resetBall();
        else if (msg.type === 'smash' && engineInitialized) gameEngine.isSmashing = true;
    }

    _onRecalibrate({ nb, ng, na }) {
        this.neutralBeta  = nb;
        this.neutralGamma = ng;
        this.neutralAlpha = na;
    }

    _onPadConnected() {
        this.padConnected = true; phoneActive = true;
        this.neutralBeta = null;
        this._updatePadUI(true);
    }

    _onOrient({ alpha, beta, gamma, nb, ng, na }) {
        const nB = nb ?? (this.neutralBeta  ?? beta);
        const nG = ng ?? (this.neutralGamma ?? gamma);
        const nA = na ?? (this.neutralAlpha ?? alpha);

        if (this.neutralBeta === null) {
            this.neutralBeta = nB; this.neutralAlpha = nA; this.neutralGamma = nG;
        }

        const dBeta  = beta  - nB;
        const dGamma = gamma - nG;
        let dAlpha   = alpha - nA;
        if (dAlpha >  180) dAlpha -= 360;
        if (dAlpha < -180) dAlpha += 360;

        // REALISTIC CRICKET BAT MOTION MAPPING:
        // 1. Guard Position across crease (X):
        const targetXOffset = Math.max(-0.60, Math.min(0.60, (dGamma / 12.0) * 0.60));
        batTargetX = batBaseX + targetXOffset;

        // 2. Vertical Height & Backlift (Y):
        const targetYOffset = Math.max(-0.02, Math.min(0.65, (-dBeta / 12.0) * 0.60));
        batTargetY = batBaseY + targetYOffset;

        // 3. Bat Backlift & Swing Pitch (RotX):
        const pitchRad = THREE.MathUtils.degToRad(-dBeta) * 1.6;
        phoneRotX = (-Math.PI / 6) + Math.max(-Math.PI / 2.2, Math.min(Math.PI / 3, pitchRad));

        // 4. Bat Face Shot Direction (RotY):
        const yawRad = THREE.MathUtils.degToRad(dAlpha) * 1.6;
        phoneRotY = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, yawRad));

        // 5. Wrist Tilt / Roll (RotZ):
        const rollRad = THREE.MathUtils.degToRad(-dGamma) * 1.0;
        phoneRotZ = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, rollRad));
    }

    _updatePadUI(connected) {
        const btn = document.getElementById('pad-status');
        if (!btn) return;
        if (connected) {
            btn.classList.add('pad-connected');
            btn.title = '🏏 Bat Connected — click to show QR';
        } else {
            btn.classList.remove('pad-connected');
            btn.title = 'Use phone as bat';
        }
    }
}

// QR overlay helpers (unchanged)
let qrVisible = false;
window.renderQR = function(url) {
    const qrDiv = document.getElementById('qr-code');
    const urlEl = document.getElementById('qr-url');
    if (!qrDiv) return;
    qrDiv.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
        new QRCode(qrDiv, { text: url, width: 180, height: 180,
            colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    }
    if (urlEl) urlEl.innerText = url;
};
window.updateNgrokUrl = function(val) {
    let clean = (val || '').trim();
    if (clean) {
        if (!clean.startsWith('http')) clean = 'https://' + clean;
        if (!clean.endsWith('/controller')) clean = clean.replace(/\/$/, '') + '/controller';
        localStorage.setItem('ngrokUrl', clean);
        window.renderQR(clean);
    }
};
window.toggleQR = function() {
    const overlay = document.getElementById('qr-overlay');
    if (!overlay) return;
    qrVisible = !qrVisible;
    if (qrVisible) {
        const input = document.getElementById('ngrok-input');
        const saved = localStorage.getItem('ngrokUrl');
        if (input && saved) input.value = saved;
        const url = saved || `http://${location.hostname}:4000/controller`;
        window.renderQR(url);
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
};

(function () {
    const btn = document.getElementById('pad-status');
    if (btn) { const dot = document.createElement('div'); dot.className = 'pad-dot'; btn.prepend(dot); }
})();

const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost  = (location.hostname && location.hostname !== '' && location.hostname !== 'null')
    ? (location.port ? `${location.hostname}:${location.port}` : location.host)
    : 'localhost:4000';
new MobileController(`${wsProto}//${wsHost}`);

// ── Ambient Particle Field (fireflies in outfield) ────────────────────────────
const PARTICLE_COUNT = 500;
const positions = new Float32Array(PARTICLE_COUNT * 3);
for (let i = 0; i < PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 5 + Math.random() * 8;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
}
const partGeo = new THREE.BufferGeometry();
partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const partMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.4 });
const particles = new THREE.Points(partGeo, partMat);
scene.add(particles);

// ── Resize Handler ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => { /* fixed 600×600 */ });

// ── Service Worker Registration ───────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.warn('ServiceWorker registration failed:', err);
        });
    });
}

// ── Animation Loop (Throttled to 30Hz for Meta Ray-Ban Display Panel) ───────────
const clock = new THREE.Clock();
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS; // ~33.33ms
let lastFrameTime = 0;
let shellHidden = false;

function animate(currentTime = 0) {
    requestAnimationFrame(animate);

    const delta = currentTime - lastFrameTime;
    if (delta < FRAME_INTERVAL - 2) {
        return; // Throttle renders to 30Hz panel refresh budget
    }

    lastFrameTime = currentTime - (delta % FRAME_INTERVAL);
    const dt = Math.min(delta / 1000, 0.1);
    const t  = clock.getElapsedTime();

    if (engineInitialized) {
        gameEngine.update(dt);
        updateTrail();
    }
    updateHitParticles(dt);
    updateStumps(dt);

    // Spin particles slowly
    particles.rotation.y = t * 0.025;

    // ── Bat movement ──────────────────────────────────────────────────────────
    if (bat && engineInitialized) {
        if (!phoneActive) {
            if (keys.ArrowLeft)  batTargetX = Math.max(batBaseX - BAT_LIMIT_X, batTargetX - BAT_SPEED);
            if (keys.ArrowRight) batTargetX = Math.min(batBaseX + BAT_LIMIT_X, batTargetX + BAT_SPEED);
            if (keys.ArrowUp)    batTargetY = Math.min(batBaseY + BAT_LIMIT_Y, batTargetY + BAT_SPEED);
            if (keys.ArrowDown)  batTargetY = Math.max(0.0, batTargetY - BAT_SPEED);
        }
        const newX = bat.position.x + (batTargetX - bat.position.x) * 0.95; // instant zero-lag follow
        const newY = bat.position.y + (batTargetY - bat.position.y) * 0.95;
        gameEngine.setPaddlePosition(newX, newY, bat.position.z);

        if (phoneActive) {
            const lerpSpeed = 0.90; // zero-lag rotation tracking
            bat.rotation.x = bat.rotation.x + (phoneRotX - bat.rotation.x) * lerpSpeed;
            bat.rotation.y = bat.rotation.y + (phoneRotY - bat.rotation.y) * lerpSpeed;
            bat.rotation.z = bat.rotation.z + (phoneRotZ - bat.rotation.z) * lerpSpeed;
        } else {
            bat.rotation.x = bat.rotation.x + (-Math.PI / 6 - bat.rotation.x) * 0.06;
            bat.rotation.y = bat.rotation.y + (Math.PI - bat.rotation.y) * 0.06;
            bat.rotation.z = bat.rotation.z + (0 - bat.rotation.z) * 0.06;
        }
    }

    // Rotate ball for realism
    if (ballMesh && gameEngine.ballActive) {
        ballMesh.rotation.x += dt * 8;
        ballMesh.rotation.z += dt * 3;
    }

    renderer.render(scene, camera);

    // Hide skeleton loading shell on first rendered frame
    if (!shellHidden) {
        shellHidden = true;
        const shell = document.getElementById('loading-shell');
        if (shell) shell.classList.add('ready');
    }
}

animate();

