import { gameEngine } from './gameEngine';
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
        gameEngine.resetBall();
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

    test('Schedules auto-bowling timer on non-terminal delivery outcome', () => {
        jest.useFakeTimers();
        gameEngine.target = 24;
        gameEngine.onRuns(4);
        expect(gameEngine.autoBowlTimer).not.toBeNull();
        jest.advanceTimersByTime(1800);
        expect(gameEngine.ballActive).toBe(true);
        gameEngine._clearAutoBowl();
        jest.useRealTimers();
    });

    test('Clamps ball position to field boundaries post-hit', () => {
        gameEngine.ballActive = true;
        gameEngine.hasHit = true;
        const outOfBoundsPos = new THREE.Vector3(10.0, 10.0, 10.0);
        gameEngine.ballMesh.position.copy(outOfBoundsPos);
        gameEngine.update(0.016);
        expect(Math.abs(gameEngine.ballMesh.position.x)).toBeLessThanOrEqual(0.75);
        expect(Math.abs(gameEngine.ballMesh.position.z)).toBeLessThanOrEqual(2.95);
    });
});
