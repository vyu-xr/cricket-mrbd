import { gameEngine } from '../src/gameEngine.js';
import * as THREE from 'three';

describe('Cricket GameEngine 1-Over Target Chase Logic', () => {
    let mockUI;

    beforeEach(() => {
        mockUI = {
            targetScore: { innerText: '' },
            ballScore: { innerText: '' },
            userScore: { innerText: '' },
            message: { innerText: '', classList: { add: jest.fn(), remove: jest.fn() } }
        };
        const mockPitch = new THREE.Object3D();
        const mockBat = new THREE.Object3D();
        const mockBot = new THREE.Object3D();
        const mockBall = new THREE.Object3D();

        gameEngine.init(new THREE.Scene(), mockPitch, mockBat, mockBot, mockBall, mockUI, jest.fn());
    });

    afterEach(() => {
        gameEngine._clearAutoBowl();
    });

    test('Initializes correctly with random target (12-24) and 1 over setup', () => {
        expect(gameEngine.runs).toBe(0);
        expect(gameEngine.wickets).toBe(0);
        expect(gameEngine.legalBalls).toBe(0);
        expect(gameEngine.maxWickets).toBe(3);
        expect(gameEngine.maxBalls).toBe(6);
        expect(gameEngine.target).toBeGreaterThanOrEqual(12);
        expect(gameEngine.target).toBeLessThanOrEqual(24);
        expect(gameEngine.gameOver).toBe(false);
    });

    test('Bowler delivers ball on resetBall', () => {
        gameEngine.resetBall(0);
        expect(gameEngine.ballActive).toBe(true);
        expect(gameEngine.ballVelocity.z).toBeGreaterThan(1.0);
    });

    test('Scoring runs updates total, legal ball count, and UI', () => {
        gameEngine.onRuns(4);
        expect(gameEngine.runs).toBe(4);
        expect(gameEngine.legalBalls).toBe(1);
        expect(mockUI.userScore.innerText).toBe('4/0');
        expect(mockUI.ballScore.innerText).toBe('1/6');
    });

    test('Wickets update and trigger game over at 3 wickets', () => {
        for (let i = 0; i < 3; i++) {
            gameEngine.onWicket('bowled');
        }
        expect(gameEngine.wickets).toBe(3);
        expect(gameEngine.gameOver).toBe(true);
        expect(mockUI.userScore.innerText).toBe('0/3');
    });

    test('Finishing 6 legal balls without reaching target triggers game over', () => {
        gameEngine.target = 24;
        for (let i = 0; i < 6; i++) {
            gameEngine._onDotBall();
        }
        expect(gameEngine.legalBalls).toBe(6);
        expect(gameEngine.gameOver).toBe(true);
    });

    test('Reaching target wins game immediately', () => {
        gameEngine.target = 15;
        gameEngine.onRuns(6);
        gameEngine.onRuns(6);
        expect(gameEngine.gameOver).toBe(false);
        gameEngine.onRuns(4); // 16 runs >= 15 target
        expect(gameEngine.runs).toBe(16);
        expect(gameEngine.gameOver).toBe(true);
    });

    test('Waits for player prompt before delivering next ball on non-terminal delivery outcome', () => {
        gameEngine.target = 24;
        gameEngine.onRuns(4);
        expect(gameEngine.ballActive).toBe(false);
        gameEngine.resetBall(0);
        expect(gameEngine.ballActive).toBe(true);
    });

    test('Allows unconstrained ball flight out of bounds post-hit', () => {
        gameEngine.ballActive = true;
        gameEngine.hasHit = true;
        gameEngine.hitTimer = 0;
        gameEngine.ballVelocity.set(0, 5, -30);
        const outPos = new THREE.Vector3(0.0, 1.0, -5.0);
        gameEngine.ballMesh.position.copy(outPos);
        gameEngine.update(0.016);
        expect(gameEngine.ballMesh.position.z).toBeLessThan(-5.0);
    });

    test('Classifies shots into 1s, 2s, 3s, 4s, and 6s based on swing speed and angle', () => {
        // Low speed defensive tap -> 1 run
        gameEngine.batSpeed.set(0.1, 0.0, 0.0);
        gameEngine._applyBatHit();
        expect(gameEngine.pendingRuns).toBe(1);

        // Gentle push -> 2 runs
        gameEngine.batSpeed.set(0.3, 0.1, 0.0);
        gameEngine._applyBatHit();
        expect(gameEngine.pendingRuns).toBe(2);

        // Good placement -> 3 runs
        gameEngine.batSpeed.set(0.7, 0.2, 0.0);
        gameEngine._applyBatHit();
        expect(gameEngine.pendingRuns).toBe(3);

        // Fast swing drive -> 4 runs
        gameEngine.batSpeed.set(1.4, 0.0, 0.0);
        gameEngine._applyBatHit();
        expect(gameEngine.pendingRuns).toBe(4);

        // High lofted smash -> 6 runs
        gameEngine.batSpeed.set(1.5, 1.5, 0.0);
        gameEngine._applyBatHit();
        expect(gameEngine.pendingRuns).toBe(6);
    });
});
