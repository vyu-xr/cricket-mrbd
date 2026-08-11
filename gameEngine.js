import * as THREE from 'three';

// ── Cricket physics constants ────────────────────────────────────────────────
const GRAVITY            = -14.0;        // realistic overarm delivery trajectory
const BALL_RADIUS        = 0.055;
const PITCH_RESTITUTION  = 0.60;         // energy preserved on bounce
const PITCH_FRICTION_X   = 0.78;         // lateral friction on pitch bounce
const PITCH_FRICTION_Z   = 0.80;         // along-pitch friction on bounce
const MIN_BOUNCE_VY      = 0.20;         // below this vertical speed → roll instead of bounce
const ROLL_DECEL         = 3.5;          // rolling deceleration (units/s²)
const AIR_DRAG_PER_SEC   = 0.04;         // fraction of horizontal speed lost per second in air
const SWING_MAX_ACCEL    = 0.40;         // max lateral swing acceleration (units/s²)
const SPIN_DECAY         = 0.55;         // how much spin survives each bounce

const DELIVERY = {
    GOOD_LENGTH : 'GOOD_LENGTH',
    BOUNCER     : 'BOUNCER',
    YORKER      : 'YORKER',
    FULL_TOSS   : 'FULL_TOSS',
    WIDE        : 'WIDE',
};

class GameEngine {
    constructor() {
        // Pitch geometry (matches main.js)
        this.pitchY          = 0.0;
        this.pitchHalfLength = 3.0;
        this.pitchHalfWidth  = 0.8;
        this.stumpsZ         = 2.75;
        this.bowlerZ         = -2.8;
        this.stumpLeft       = -0.13;
        this.stumpRight      =  0.13;
        this.stumpTop        =  0.76;

        // Physics state
        this.ballVelocity    = new THREE.Vector3();
        this.ballSpin        = new THREE.Vector3();   // rotation affects seam deviation
        this.swingAccel      = new THREE.Vector3();   // lateral in/out-swing force
        this.rolling         = false;
        this.bounceCount     = 0;
        this.deliveryType    = DELIVERY.GOOD_LENGTH;

        // Game state
        this.ballActive      = false;
        this.runs            = 0;
        this.wickets         = 0;
        this.maxWickets      = 3;
        this.legalBalls      = 0;
        this.maxBalls        = 6;
        this.target          = 0;
        this.gameOver        = false;
        this.hasBounced      = false;
        this.hasHit          = false;
        this.level           = 1;
        this.isSmashing      = false;

        // Bat state
        this.batMesh         = null;
        this.ballMesh        = null;
        this.prevBatPos      = new THREE.Vector3();
        this.batSpeed        = new THREE.Vector3();
        this.hitDistance     = 0.22;

        this.subSteps        = 8;
        this.onEvent         = null;
        this.ui              = null;
        this.autoBowlTimer   = null;
        this._tempPos        = new THREE.Vector3();
    }

    fireEvent(name, data = {}) {
        if (this.onEvent) this.onEvent(name, data);
    }

    init(scene, pitchMesh, batMesh, _botPaddle, ballMesh, ui, onEvent) {
        this.batMesh  = batMesh;
        this.ballMesh = ballMesh;
        this.ui       = ui;
        this.onEvent  = onEvent;
        this.prevBatPos.copy(batMesh.position);
        this.resetGame(false);
    }

    resetGame(isLevelUp = false) {
        this._clearAutoBowl();
        this.runs       = 0;
        this.wickets    = 0;
        this.legalBalls = 0;
        this.target     = Math.floor(Math.random() * 13) + 12; // 12 to 24
        this.gameOver   = false;
        this.isSmashing = false;
        if (isLevelUp) {
            this.level++;
            this.fireEvent('levelUp', { level: this.level });
        }
        this.updateUI();
        if (this.ballMesh) this.ballMesh.position.set(0, -10, 0);
        this.ballActive = false;
        if (this.ui && this.ui.message) {
            this.ui.message.innerText = `CHASE ${this.target} RUNS IN 6 BALLS!`;
            this.ui.message.classList.add('pulse-anim');
        }
        this.fireEvent('resetGame', { target: this.target });
    }

    updateUI() {
        if (this.ui) {
            if (this.ui.targetScore) this.ui.targetScore.innerText = this.target;
            if (this.ui.userScore)   this.ui.userScore.innerText   = `${this.runs}/${this.wickets}`;
            if (this.ui.ballScore)   this.ui.ballScore.innerText   = `${this.legalBalls}/${this.maxBalls}`;
        }
    }

    _clearAutoBowl() {
        if (this.autoBowlTimer) {
            clearTimeout(this.autoBowlTimer);
            this.autoBowlTimer = null;
        }
    }

    _scheduleAutoBowl(delayMs = 1500) {
        this._clearAutoBowl();
        if (this.gameOver) return;
        this.autoBowlTimer = setTimeout(() => {
            this.autoBowlTimer = null;
            if (!this.gameOver && !this.ballActive) {
                this.bowl();
            }
        }, delayMs);
    }

    resetBall() {
        this._clearAutoBowl();
        if (this.gameOver) { this.resetGame(); return; }
        if (this.ballActive) return;
        if (this.ui) { this.ui.message.innerText = ''; this.ui.message.classList.remove('pulse-anim'); }
        this.bowl();
    }

    // ── Select delivery type based on difficulty level ────────────────────────
    _chooseDelivery() {
        const r = Math.random();
        if (this.level <= 2) {
            if (r < 0.65) return DELIVERY.GOOD_LENGTH;
            if (r < 0.85) return DELIVERY.FULL_TOSS;
            if (r < 0.95) return DELIVERY.YORKER;
            return DELIVERY.WIDE; // 5%
        } else if (this.level <= 4) {
            if (r < 0.45) return DELIVERY.GOOD_LENGTH;
            if (r < 0.68) return DELIVERY.YORKER;
            if (r < 0.85) return DELIVERY.BOUNCER;
            if (r < 0.95) return DELIVERY.FULL_TOSS;
            return DELIVERY.WIDE; // 5%
        } else {
            if (r < 0.35) return DELIVERY.GOOD_LENGTH;
            if (r < 0.60) return DELIVERY.BOUNCER;
            if (r < 0.80) return DELIVERY.YORKER;
            if (r < 0.95) return DELIVERY.FULL_TOSS;
            return DELIVERY.WIDE; // 5%
        }
    }

    bowl() {
        this.ballActive  = true;
        this.hasBounced  = false;
        this.hasHit      = false;
        this.isSmashing  = false;
        this.rolling     = false;
        this.bounceCount = 0;
        this.hitTimer    = 0;
        this.deliveryType = this._chooseDelivery();

        const spawnX  = (Math.random() * 2 - 1) * 0.08;
        const spawnZ  = this.bowlerZ + 0.05;
        const pitchLen = this.stumpsZ - spawnZ;   // total pitch length in Z
        const baseSpeed = 4.0 + this.level * 0.35; // slowed delivery — more reaction time

        // Vary target line across 5 realistic cricket bowling lines strictly on pitch:
        // Outside Off (+0.24), Off Stump (+0.12), Middle (0.0), Leg Stump (-0.12), Down Leg (-0.24)
        const cricketLines = [0.24, 0.12, 0.0, -0.12, -0.24];
        const baseLine = cricketLines[Math.floor(Math.random() * cricketLines.length)];
        const lineJitter = (Math.random() * 2 - 1) * 0.04;

        const targetX = this.deliveryType === DELIVERY.WIDE
            ? (Math.random() > 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.05)
            : baseLine + lineJitter;
        const dx = targetX - spawnX;

        let spawnY, velX, velY, velZ;

        // Helper: compute Y velocity to arc from spawnY to landing at pitchY + BALL_RADIUS
        const arcY = (sy, dz, vHz) => {
            const tFlight = Math.abs(dz / vHz);
            return ((this.pitchY + BALL_RADIUS) - sy - 0.5 * GRAVITY * tFlight * tFlight) / tFlight;
        };

        // Release at overarm shoulder height (0.82) for direct forward trajectory from bowler
        spawnY = this.pitchY + 0.82;

        switch (this.deliveryType) {
            case DELIVERY.GOOD_LENGTH: {
                // Pitches ~40-50% from batsman end
                const bounceZ = this.stumpsZ - pitchLen * 0.42;
                const dz = bounceZ - spawnZ;
                velZ = baseSpeed * 0.92;
                velX = (dx / dz) * velZ;
                velY = arcY(spawnY, dz, velZ);
                break;
            }
            case DELIVERY.BOUNCER: {
                // Pitches short — rises to chest/head height
                spawnY = this.pitchY + 0.90;
                const bounceZ = this.stumpsZ - pitchLen * 0.62;
                const dz = bounceZ - spawnZ;
                velZ = baseSpeed * 0.96;
                velX = (dx / dz) * velZ;
                velY = arcY(spawnY, dz, velZ);
                break;
            }
            case DELIVERY.YORKER: {
                // Pitches right at batsman's feet
                const bounceZ = this.stumpsZ - 0.18;
                const dz = bounceZ - spawnZ;
                velZ = baseSpeed * 0.98;
                velX = (dx / dz) * velZ;
                velY = arcY(spawnY, dz, velZ);
                break;
            }
            case DELIVERY.FULL_TOSS: {
                // Reaches batsman at waist height without bounce
                const dz = pitchLen;
                velZ = baseSpeed * 0.95;
                velX = (dx / dz) * velZ;
                const tFlight = dz / velZ;
                velY = (0.55 - spawnY - 0.5 * GRAVITY * tFlight * tFlight) / tFlight;
                break;
            }
            case DELIVERY.WIDE: {
                const bounceZ = this.stumpsZ - pitchLen * 0.44;
                const dz = bounceZ - spawnZ;
                velZ = baseSpeed * 0.90;
                velX = (dx / dz) * velZ;
                velY = arcY(spawnY, dz, velZ);
                break;
            }
        }

        this.ballMesh.position.set(spawnX, spawnY, spawnZ);
        this.ballVelocity.set(velX, velY, velZ);

        // In-swing / out-swing lateral drift (scales with level)
        const swingMag = (Math.random() * 2 - 1) * SWING_MAX_ACCEL * Math.min(this.level * 0.22, 1.0);
        this.swingAccel.set(swingMag, 0, 0);

        // Seam spin: affects post-bounce lateral deviation
        const spinDir = Math.random() > 0.5 ? 1 : -1;
        this.ballSpin.set(spinDir * (0.4 + Math.random() * 1.2), 0, Math.random() > 0.5 ? 0.5 : -0.5);

        // UI hint
        const typeLabel = {
            [DELIVERY.BOUNCER]  : '🔥 BOUNCER!',
            [DELIVERY.YORKER]   : '⚡ YORKER!',
            [DELIVERY.FULL_TOSS]: '🎾 FULL TOSS',
            [DELIVERY.WIDE]     : '↔ WIDE BALL',
        };
        if (typeLabel[this.deliveryType] && this.ui) {
            this.ui.message.innerText = typeLabel[this.deliveryType];
        }
        this.fireEvent('delivery', { type: this.deliveryType });
    }

    _checkGameStatus(lastEventText = '') {
        if (this.runs >= this.target) {
            this.gameOver = true;
            this._clearAutoBowl();
            this.fireEvent('matchWin', { runs: this.runs, target: this.target, wickets: this.wickets });
            const wktsLeft = this.maxWickets - this.wickets;
            if (this.ui) {
                this.ui.message.innerText = `🎉 TARGET CHASED! WON BY ${wktsLeft} WKT${wktsLeft !== 1 ? 'S' : ''}!`;
                this.ui.message.classList.add('pulse-anim');
            }
            return true;
        }

        if (this.wickets >= this.maxWickets) {
            this.gameOver = true;
            this._clearAutoBowl();
            this.fireEvent('matchLose', { reason: 'allOut' });
            const needed = this.target - this.runs;
            if (this.ui) {
                this.ui.message.innerText = `💥 ALL OUT! NEEDED ${needed} MORE RUN${needed > 1 ? 'S' : ''}`;
                this.ui.message.classList.add('pulse-anim');
            }
            return true;
        }

        if (this.legalBalls >= this.maxBalls) {
            this.gameOver = true;
            this._clearAutoBowl();
            this.fireEvent('matchLose', { reason: 'overFinished' });
            const needed = this.target - this.runs;
            if (this.ui) {
                this.ui.message.innerText = `⌛ OVER FINISHED! NEEDED ${needed} MORE RUN${needed > 1 ? 'S' : ''}`;
                this.ui.message.classList.add('pulse-anim');
            }
            return true;
        }

        if (this.ui && lastEventText) {
            const ballsLeft = this.maxBalls - this.legalBalls;
            const needed = Math.max(0, this.target - this.runs);
            this.ui.message.innerText = `${lastEventText} | NEED ${needed} IN ${ballsLeft} BALL${ballsLeft !== 1 ? 'S' : ''}`;
            this.ui.message.classList.add('pulse-anim');
        }
        this._scheduleAutoBowl(1500);
        return false;
    }

    // ── Wicket outcomes ───────────────────────────────────────────────────────
    onWicket(reason = 'bowled') {
        this.ballActive  = false;
        this.isSmashing  = false;
        this.wickets++;
        this.legalBalls++;
        this.updateUI();
        this.fireEvent('wicket', { wickets: this.wickets, reason });
        const wMsg = reason === 'caught' ? '🧤 CAUGHT!' : reason === 'lbw' ? 'LBW!' : 'BOWLED!';
        this._checkGameStatus(wMsg);
    }

    onWide() {
        this.ballActive = false;
        this.isSmashing = false;
        this.runs      += 1;
        this.updateUI();
        this.fireEvent('wide', { runs: 1, total: this.runs });
        if (this.ballMesh) this.ballMesh.position.set(0, -10, 0);
        this._checkGameStatus('↔ WIDE BALL (+1 RUN)');
    }

    onRuns(r) {
        this.ballActive  = false;
        this.isSmashing  = false;
        this.runs       += r;
        this.legalBalls++;
        this.updateUI();
        this.fireEvent('runs', { runs: r, total: this.runs });
        const text = r === 6 ? '🚀 SIX!' : r === 4 ? '⚡ FOUR!' : `+${r} RUN${r > 1 ? 'S' : ''}`;
        this._checkGameStatus(text);
    }

    setPaddlePosition(x, y, z) {
        if (this.batMesh) this.batMesh.position.set(x, y, z);
    }

    // ── Main physics update ───────────────────────────────────────────────────
    update(dt) {
        if (!this.ballMesh || !this.batMesh) return;

        // Bat velocity tracking
        const curPos = this.batMesh.position;
        const inv = dt > 0 ? 1 / dt : 0;
        this.batSpeed.x = (curPos.x - this.prevBatPos.x) * inv;
        this.batSpeed.y = (curPos.y - this.prevBatPos.y) * inv;
        this.batSpeed.z = (curPos.z - this.prevBatPos.z) * inv;
        this.prevBatPos.copy(curPos);

        if (!this.ballActive) return;

        const pos  = this._tempPos.copy(this.ballMesh.position);
        const step = dt / this.subSteps;

        for (let i = 0; i < this.subSteps; i++) {
            if (!this.rolling) {
                // ── Airborne physics ────────────────────────────────────────
                this.ballVelocity.y += GRAVITY * step;

                // Air drag on horizontal components
                const dragFactor = 1 - AIR_DRAG_PER_SEC * step;
                this.ballVelocity.x *= dragFactor;
                this.ballVelocity.z *= dragFactor;

                // In-swing / out-swing (only before first bounce)
                if (!this.hasBounced) {
                    this.ballVelocity.x += this.swingAccel.x * step;
                }

                pos.x += this.ballVelocity.x * step;
                pos.y += this.ballVelocity.y * step;
                pos.z += this.ballVelocity.z * step;

                // ── Ground collision ────────────────────────────────────────
                if (pos.y <= this.pitchY + BALL_RADIUS && this.ballVelocity.y < 0) {
                    pos.y = this.pitchY + BALL_RADIUS;

                    const vyIn  = this.ballVelocity.y;
                    const vyOut = -vyIn * PITCH_RESTITUTION;

                    const onPitch = Math.abs(pos.x) < this.pitchHalfWidth
                                 && pos.z > -this.pitchHalfLength
                                 && pos.z < this.stumpsZ + 0.15;

                    if (onPitch) {
                        // Seam / spin effects on bounce
                        this.ballVelocity.x = this.ballVelocity.x * PITCH_FRICTION_X + this.ballSpin.x * 0.10;
                        this.ballVelocity.z = this.ballVelocity.z * PITCH_FRICTION_Z;
                        // Topspin: ball skids faster; backspin: slows
                        this.ballVelocity.z += this.ballSpin.z * 0.06;
                        this.ballSpin.multiplyScalar(SPIN_DECAY);
                        this.hasBounced = true;
                        this.bounceCount++;
                    } else {
                        // Outfield — softer bounce
                        this.ballVelocity.x *= 0.68;
                        this.ballVelocity.z *= 0.72;
                    }

                    if (vyOut < MIN_BOUNCE_VY) {
                        // Transition to rolling
                        this.ballVelocity.y = 0;
                        this.rolling = true;
                    } else {
                        this.ballVelocity.y = vyOut;
                    }

                    this.fireEvent('hit', { type: 'pitch', pos, count: this.bounceCount });
                }
            } else {
                // ── Rolling physics ─────────────────────────────────────────
                pos.y = this.pitchY + BALL_RADIUS;
                this.ballVelocity.y = 0;

                const hSpeed = Math.sqrt(
                    this.ballVelocity.x * this.ballVelocity.x +
                    this.ballVelocity.z * this.ballVelocity.z
                );

                if (hSpeed < 0.06) {
                    // Ball fully stopped
                    this.ballVelocity.set(0, 0, 0);
                    this.ballMesh.position.copy(pos);
                    if (!this.hasHit) {
                        this._onDotBall();
                    } else {
                        this._onRolledToStop(pos);
                    }
                    return;
                }

                // Gradual deceleration
                const decel = Math.max(0, 1 - (ROLL_DECEL / hSpeed) * step);
                this.ballVelocity.x *= decel;
                this.ballVelocity.z *= decel;
                pos.x += this.ballVelocity.x * step;
                pos.z += this.ballVelocity.z * step;
            }
        }

        // ── Clamp ball position strictly to pitch boundary limits ───────────
        pos.x = Math.max(-0.75, Math.min(0.75, pos.x));
        pos.z = Math.max(-2.95, Math.min(2.95, pos.z));

        // ── Bat hit detection (tight impact area on bat blade) ────────────────
        if (!this.hasHit) {
            const bp  = this.batMesh.position;
            const dx  = pos.x - bp.x;
            const dy  = pos.y - (bp.y + 0.25); // center hit check on bat blade
            const dz  = pos.z - bp.z;

            if (Math.abs(dx) < 0.18 && Math.abs(dz) < 0.18 && Math.abs(dy) < 0.22) {
                this.hasHit  = true;
                this.rolling = false;
                this.hitTimer = 0;
                this._applyBatHit();
                this.fireEvent('hit', { type: 'bat', pos });
                if (this.isSmashing) this.fireEvent('smash');
            }
        }

        // ── Ball past batsman without hit ─────────────────────────────────────
        if (!this.hasHit && pos.z >= 2.75) {
            this.ballMesh.position.copy(pos);

            // 1. Check if ball hit the stumps (BOWLED)
            const onStumps = pos.x >= this.stumpLeft && pos.x <= this.stumpRight
                          && pos.y >= 0.0 && pos.y <= this.stumpTop;
            if (onStumps) {
                this.onWicket('bowled');
                return;
            }

            // 2. Check if delivery is WIDE
            const isWide = this.deliveryType === DELIVERY.WIDE || Math.abs(pos.x) > 0.42 || pos.y > 2.0;
            if (isWide) {
                this.onWide();
                return;
            }

            // 3. Legal delivery missed by batsman -> DOT BALL
            this._onDotBall();
            return;
        }

        // ── Post-hit resolution & pitch clamping ──────────────────────────────
        if (this.hasHit) {
            this.hitTimer += dt;
            const pastBowler = pos.z < this.bowlerZ + 0.2;
            const atSide     = Math.abs(pos.x) > 0.68;
            const isTimeout  = this.hitTimer > 1.2;

            if (pastBowler || atSide || isTimeout || this.rolling) {
                pos.x = Math.max(-0.75, Math.min(0.75, pos.x));
                pos.z = Math.max(-2.95, Math.min(2.95, pos.z));
                pos.y = Math.max(0.05, Math.min(1.5, pos.y));
                this.ballMesh.position.copy(pos);
                this.onRuns(this._calcRuns(pos));
                return;
            }
        }

        // ── Ball lost below world ─────────────────────────────────────────────
        if (pos.y < -2.5) {
            this.ballActive = false;
            this.ballMesh.position.set(0, -10, 0);
            if (this.ui) {
                this.ui.message.innerText = 'NO BALL — CLICK TO FACE';
                this.ui.message.classList.add('pulse-anim');
            }
            return;
        }

        this.ballMesh.position.copy(pos);
    }

    // ── Bat hit — redirect ball with swing power & direction ──────────────────
    _applyBatHit() {
        const swX = this.batSpeed.x;
        const swY = this.batSpeed.y;
        const swingMag = Math.sqrt(swX * swX + swY * swY);

        this.isSmashing = swingMag > 1.5;

        let hitPower = 5.0 + swingMag * 0.75;
        hitPower = Math.min(hitPower, 10.5);

        // Direction mostly back toward bowler, modulated by lateral swing
        let dirX = swX * 0.60 + (Math.random() - 0.5) * 0.22;
        let dirZ = -(0.85 + Math.random() * 0.15);
        let dirY = 0.32 + Math.max(0, swY) * 0.55;
        if (this.isSmashing) { dirY += 0.5; hitPower = Math.min(hitPower + 1.5, 11.0); }

        const mag = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
        this.ballVelocity.set(
            (dirX / mag) * hitPower,
            (dirY / mag) * hitPower,
            (dirZ / mag) * hitPower
        );

        // Clear swing / spin effects after bat contact
        this.ballSpin.set(0, 0, 0);
        this.swingAccel.set(0, 0, 0);
    }

    // ── Run calculation based on ball position and speed ─────────────────────
    _calcRuns(pos) {
        const speed  = this.ballVelocity.length();
        const height = pos.y;
        if (height > 2.0 || (this.isSmashing && speed > 7.0)) return 6;
        if (speed > 4.5 || Math.abs(pos.x) > 2.5)              return 4;
        if (speed > 2.8)                                         return 2;
        return 1;
    }

    _onDotBall() {
        this.ballActive = false;
        this.legalBalls++;
        this.updateUI();
        if (this.ballMesh) this.ballMesh.position.set(0, -10, 0);
        this.fireEvent('dotBall');
        this._checkGameStatus('DOT BALL');
    }

    _onRolledToStop(pos) {
        // Ball stopped in outfield after being hit — award runs by distance
        const dist = Math.sqrt(pos.x * pos.x + (pos.z - this.stumpsZ) * (pos.z - this.stumpsZ));
        this.onRuns(dist > 4.0 ? 2 : 1);
    }
}

export const gameEngine = new GameEngine();
