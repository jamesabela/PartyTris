/**
 * PartyTris: Christmas Edition (JS Port)
 */

// === Config ===
const COLS = 10;
const ROWS = 20;
const GAP = 60; // Gap between boards
const EXTRA_HEIGHT = 80; // Header space
let BLOCK_SIZE = 30; // will be scaled dynamically
const FPS = 60;
const GRAVITY_DELAY = 1000;

// Colors - Christmas Theme
const SHAPE_COLORS = {
    'O': '#FFD700', // Gold
    'I': '#00FFFF', // Ice Blue
    'S': '#008000', // Green
    'Z': '#FF0000', // Red
    'L': '#FF8C00', // Dark Orange
    'J': '#0000FF', // Blue
    'T': '#800080', // Purple
    'X': '#696969'  // Coal (Garbage)
};

const SHAPES = {
    'O': [[1, 1], [1, 1]],
    'I': [[1, 1, 1, 1]],
    'S': [[0, 1, 1], [1, 1, 0]],
    'Z': [[1, 1, 0], [0, 1, 1]],
    'L': [[1, 0, 0], [1, 1, 1]],
    'J': [[0, 0, 1], [1, 1, 1]],
    'T': [[0, 1, 0], [1, 1, 1]],
};

// Canvas & Context
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Touch/Layout detection
const coarsePointerQuery = window.matchMedia('(pointer: coarse)');

function shouldUseTabletLayout() {
    return coarsePointerQuery.matches || navigator.maxTouchPoints > 1;
}

function updateTabletClass() {
    document.body.classList.toggle('tablet-controls', shouldUseTabletLayout());
}

if (coarsePointerQuery.addEventListener) {
    coarsePointerQuery.addEventListener('change', updateTabletClass);
} else if (coarsePointerQuery.addListener) {
    coarsePointerQuery.addListener(updateTabletClass);
}

// Game State
let gameMode = '2p';
let gameDuration = 180; // seconds
let gameStartTime = 0;
let gameOver = false;
let paused = false;
let lastTime = 0;
let keys = {};
let touchState = {};

// Helper Classes
class BagQueue {
    constructor() {
        this.queue = [];
    }

    refill() {
        const bag = Object.keys(SHAPES);
        // Fisher-Yates shuffle
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        this.queue.push(...bag);
    }

    next() {
        if (this.queue.length === 0) {
            this.refill();
        }
        return this.queue.shift();
    }
}

const globalBag = new BagQueue();

class Player {
    constructor(offsetX, isAI = false) {
        this.offsetX = offsetX; // Render offset logic handled in draw
        this.originalOffsetX = offsetX; // Store for reset
        this.grid = this.createGrid();
        this.score = 0;
        this.gameOver = false;
        this.isAI = isAI;
        this.dropTimer = 0;
        this.spawn();

        // Input handling specific to player instance
        this.nextMoveTime = 0;
    }

    createGrid() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(''));
    }

    spawn() {
        const type = globalBag.next();
        this.piece = {
            type: type,
            shape: SHAPES[type],
            x: 3,
            y: 0
        };
        if (this.checkCollision(this.grid, this.piece)) {
            this.gameOver = true;
        }
    }

    checkCollision(grid, piece) {
        for (let y = 0; y < piece.shape.length; y++) {
            for (let x = 0; x < piece.shape[y].length; x++) {
                if (piece.shape[y][x]) {
                    const px = piece.x + x;
                    const py = piece.y + y;
                    if (px < 0 || px >= COLS || py >= ROWS || (py >= 0 && grid[py][px])) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    rotate() {
        if (this.gameOver) return;
        const oldShape = this.piece.shape;
        // Matrix rotation
        this.piece.shape = this.piece.shape[0].map((val, index) =>
            this.piece.shape.map(row => row[index]).reverse()
        );

        if (this.checkCollision(this.grid, this.piece)) {
            // Wall kicks
            const kicks = [-1, 1, -2, 2];
            let kicked = false;
            for (let dx of kicks) {
                this.piece.x += dx;
                if (!this.checkCollision(this.grid, this.piece)) {
                    kicked = true;
                    break;
                }
                this.piece.x -= dx;
            }
            if (!kicked) {
                this.piece.shape = oldShape; // Revert
            }
        }
    }

    move(dx) {
        if (this.gameOver) return;
        this.piece.x += dx;
        if (this.checkCollision(this.grid, this.piece)) {
            this.piece.x -= dx;
        }
    }

    drop(opponent) {
        if (this.gameOver) return;
        this.piece.y += 1;
        this.score += 1; // Soft drop points
        if (this.checkCollision(this.grid, this.piece)) {
            this.piece.y -= 1;
            if (this.piece.y <= 0) {
                this.gameOver = true;
            } else {
                this.lockPiece();
                const cleared = this.clearLines(opponent);
                const points = [0, 100, 300, 500, 800];
                this.score += points[cleared] || 0;
                this.spawn();
            }
        }
    }

    hardDrop(opponent) {
        if (this.gameOver) return;
        while (!this.checkCollision(this.grid, this.piece)) {
            this.piece.y += 1;
            this.score += 2; // Hard drop points
        }
        this.piece.y -= 1;
        this.lockPiece();
        const cleared = this.clearLines(opponent);
        const points = [0, 100, 300, 500, 800];
        this.score += points[cleared] || 0;
        this.spawn();
    }

    lockPiece() {
        for (let y = 0; y < this.piece.shape.length; y++) {
            for (let x = 0; x < this.piece.shape[y].length; x++) {
                if (this.piece.shape[y][x]) {
                    const py = this.piece.y + y;
                    const px = this.piece.x + x;
                    if (py >= 0 && py < ROWS && px >= 0 && px < COLS) {
                        this.grid[py][px] = this.piece.type;
                    }
                }
            }
        }
    }

    clearLines(opponent) {
        let cleared = 0;
        for (let y = ROWS - 1; y >= 0; y--) {
            if (this.grid[y].every(cell => cell !== '')) {
                this.grid.splice(y, 1);
                this.grid.unshift(Array(COLS).fill(''));
                cleared++;
                y++; // check same row again as lines shifted down
            }
        }

        if (cleared >= 2 && opponent) {
            this.addGarbage(opponent.grid, cleared);
        }
        return cleared;
    }

    addGarbage(grid, count) {
        for (let i = 0; i < count; i++) {
            grid.shift();
            const hole = Math.floor(Math.random() * COLS);
            const row = Array(COLS).fill('X');
            row[hole] = '';
            grid.push(row);
        }
    }

    update(deltaTime, opponent) {
        if (this.gameOver) return;

        // AI Logic
        if (this.isAI) {
            this.updateAI(deltaTime, opponent);
        }

        this.dropTimer += deltaTime;
        if (this.dropTimer > GRAVITY_DELAY) {
            this.drop(opponent);
            this.dropTimer = 0;
        }
    }

    updateAI(deltaTime, opponent) {
        // Simple random AI logic from original
        if (Math.random() < 0.02) this.rotate();
        if (Math.random() < 0.05) this.move(Math.random() < 0.5 ? -1 : 1);

        // AI doesn't hard drop often to survive longer
        // Original logic was just move/rotate and gravity
    }
}

// Global Players
let p1, p2;

// === Input Handling ===
function setupInputs() {
    window.addEventListener('keydown', e => {
        if (e.repeat) return;
        keys[e.key] = true;
        handleInput(e.key, true);
    });

    window.addEventListener('keyup', e => {
        keys[e.key] = false;
        handleInput(e.key, false);
    });

    // Touch Handling - delegate to touch controls
    const buttons = document.querySelectorAll('.t-btn');
    buttons.forEach(btn => {
        const key = btn.dataset.key;

        // Use pointer events for better handling
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            keys[key] = true;
            handleInput(key, true);
        });

        btn.addEventListener('pointerup', (e) => {
            e.preventDefault();
            keys[key] = false;
            handleInput(key, false);
        });

        btn.addEventListener('pointerleave', (e) => {
            if (keys[key]) {
                keys[key] = false;
                handleInput(key, false);
            }
        });

        btn.addEventListener('pointercancel', () => {
            if (keys[key]) {
                keys[key] = false;
                handleInput(key, false);
            }
        });
    });

    // UI Buttons
    document.getElementById('restart-btn').onclick = startGame;

    document.getElementById('menu-btn').onclick = () => {
        showMenu();
    };
}

const heldKeys = {};
const HOLD_DELAY = 200;

function handleInput(key, isPressed) {
    if (gameOver || paused) return;

    // Key Mappings
    // P1: WASD
    // P2: Arrows (or AI)

    if (isPressed) {
        // Instant Actions
        if (key === 'w' || key === 'W') p1.rotate();
        if (key === 'a' || key === 'A') p1.move(-1);
        if (key === 'd' || key === 'D') p1.move(1);
        if (key === 's' || key === 'S' || key === 's_hard') {
            // Soft drop logic handled in loop or tap?
            // Original: tap=soft, hold=hard. Let's simplify for web:
            // S = soft drop manual, mapped hard drop button separate for touch
            if (key === 's_hard') p1.hardDrop(p2);
            else p1.drop(p2);
        }

        if (gameMode === '2p') {
            if (key === 'ArrowUp') p2.rotate();
            if (key === 'ArrowLeft') p2.move(-1);
            if (key === 'ArrowRight') p2.move(1);
            if (key === 'ArrowDown' || key === 'ArrowDown_hard') {
                if (key === 'ArrowDown_hard') p2.hardDrop(p1);
                else p2.drop(p1);
            }
        }
    }
}


// === Rendering ===
// Use ResizeObserver for more robust dynamic resizing
const resizeObserver = new ResizeObserver(() => resize());
const observedContainer = document.getElementById('game-container');
if (observedContainer) {
    resizeObserver.observe(observedContainer);
}

window.addEventListener('orientationchange', () => {
    updateTabletClass();
    setTimeout(() => resize(), 50);
});

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => resize());
}

function resize() {
    const container = document.getElementById('game-container');
    if (!container) return;

    const cssWidth = container.clientWidth;
    const cssHeight = container.clientHeight;
    if (!cssWidth || !cssHeight) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const displayWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const displayHeight = Math.max(1, Math.floor(cssHeight * dpr));
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    let availableWidth = cssWidth;
    let availableHeight = cssHeight;
    let offsetX = 0;
    let offsetY = 0;

    const usingTabletControls = document.body.classList.contains('tablet-controls');

    if (gameMode === '1p') {
        const controlHeight = usingTabletControls ? 220 : 160;
        if (availableHeight > controlHeight + 200) {
            availableHeight -= controlHeight;
        }
    } else {
        if (usingTabletControls) {
            const controlHeight = 200;
            if (availableHeight > controlHeight + 200) {
                availableHeight -= controlHeight;
            }
        } else {
            const controlWidth = 200;
            if (availableWidth > controlWidth * 2 + 200) {
                availableWidth -= (controlWidth * 2);
                offsetX = controlWidth;
            }
        }
    }

    const boardUnitW = (COLS * 30);
    const totalIdealW = (boardUnitW * 2) + GAP;
    const totalIdealH = (ROWS * 30) + EXTRA_HEIGHT;

    const scaleW = availableWidth / totalIdealW;
    const scaleH = availableHeight / totalIdealH;

    const scale = Math.max(0.1, Math.min(scaleW, scaleH) * 0.95);

    const centerX = offsetX + (availableWidth - (totalIdealW * scale)) / 2;
    const centerY = offsetY + (availableHeight - (totalIdealH * scale)) / 2;

    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, centerX * dpr, centerY * dpr);
}

function drawGrid(player, offsetX) {
    // Background - Dark Red
    ctx.fillStyle = 'rgba(60, 0, 0, 0.7)';
    ctx.fillRect(offsetX, EXTRA_HEIGHT, COLS * BLOCK_SIZE, ROWS * BLOCK_SIZE);

    // Grid Lines (very subtle gold)
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(offsetX + i * BLOCK_SIZE, EXTRA_HEIGHT);
        ctx.lineTo(offsetX + i * BLOCK_SIZE, EXTRA_HEIGHT + ROWS * BLOCK_SIZE);
        ctx.stroke();
    }
    for (let i = 0; i <= ROWS; i++) {
        ctx.beginPath();
        ctx.moveTo(offsetX, EXTRA_HEIGHT + i * BLOCK_SIZE);
        ctx.lineTo(offsetX + COLS * BLOCK_SIZE, EXTRA_HEIGHT + i * BLOCK_SIZE);
        ctx.stroke();
    }

    // Cells
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const cell = player.grid[y][x];
            if (cell) {
                drawBlock(offsetX + x * BLOCK_SIZE, EXTRA_HEIGHT + y * BLOCK_SIZE, cell);
            }
        }
    }

    // Active Piece
    if (!player.gameOver && player.piece) {
        const p = player.piece;
        for (let y = 0; y < p.shape.length; y++) {
            for (let x = 0; x < p.shape[y].length; x++) {
                if (p.shape[y][x]) {
                    drawBlock(
                        offsetX + (p.x + x) * BLOCK_SIZE,
                        EXTRA_HEIGHT + (p.y + y) * BLOCK_SIZE,
                        p.type
                    );
                }
            }
        }
    }

    // Board Border - Gold
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.strokeRect(offsetX, EXTRA_HEIGHT, COLS * BLOCK_SIZE, ROWS * BLOCK_SIZE);

    // Decorations (Garland with Ornaments)
    ctx.fillStyle = '#165b33';
    ctx.fillRect(offsetX - 6, EXTRA_HEIGHT - 12, COLS * BLOCK_SIZE + 12, 12);

    // Add Ornaments
    const ornamentColors = ['#ff0000', '#ffd700', '#c0c0c0', '#0000ff'];
    for (let i = 0; i < 8; i++) {
        ctx.fillStyle = ornamentColors[i % ornamentColors.length];
        const ox = offsetX + (i * ((COLS * BLOCK_SIZE) / 7));
        ctx.beginPath();
        ctx.arc(ox, EXTRA_HEIGHT - 6, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawBlock(x, y, type) {
    const color = SHAPE_COLORS[type];

    // Bevel effect
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);

    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(x + 1, y + 1, BLOCK_SIZE - 2, 4);
    ctx.fillRect(x + 1, y + 1, 4, BLOCK_SIZE - 2);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(x + BLOCK_SIZE - 5, y + 1, 4, BLOCK_SIZE - 2);
    ctx.fillRect(x + 1, y + BLOCK_SIZE - 5, BLOCK_SIZE - 2, 4);
}

function draw() {
    // Clear handled by canvas background, but good to clear
    // We used setTransform so we need to clear transparently
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (!p1 || !p2) return;

    // Draw Score and Time
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset for UI overlays if needed, but here we are in Game World
    // Actually we want to draw text relative to boards, so keep transform or reset?
    // Let's reset for HUD to keep it clean? 
    // No, standard `fillText` in transformed space is easier for alignment.
    ctx.restore(); // Use global transform set by resize

    ctx.fillStyle = '#fff';
    ctx.font = '24px "Mountains of Christmas"';
    ctx.textAlign = 'center';

    // P1 Info
    drawGrid(p1, 0);
    ctx.fillStyle = '#f8b229';
    ctx.fillText(`Player 1: ${p1.score}`, (COLS * BLOCK_SIZE) / 2, 30);

    // P2 Info
    const p2Offset = (COLS * BLOCK_SIZE) + GAP;
    drawGrid(p2, p2Offset);
    ctx.fillText(p2.isAI ? `CPU: ${p2.score}` : `Player 2: ${p2.score}`, p2Offset + (COLS * BLOCK_SIZE / 2), 30);

    // Timer (Centered)
    const centerX = p2Offset - (GAP / 2);
    ctx.fillStyle = '#d42426';
    ctx.font = 'bold 30px "Roboto"';

    const remaining = Math.max(0, gameDuration - Math.floor((Date.now() - gameStartTime) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const timeText = `${mins}:${secs.toString().padStart(2, '0')}`;

    ctx.fillText(timeText, centerX, 50);
}

// === Loop ===
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    if (!paused && !gameOver) {
        // Check Time
        const elapsed = (Date.now() - gameStartTime) / 1000;
        if (elapsed >= gameDuration) {
            endGame();
            draw(); // Draw final state
            return;
        }

        if (p1 && p2) {
            p1.update(deltaTime, p2);
            p2.update(deltaTime, p1);

            if (p1.gameOver && p2.gameOver) {
                endGame();
            } else if (p1.gameOver || p2.gameOver) {
                // Wait for both? Or instant win? 
                // Original PartyTris: Game continues until time OR both die?
                // Rules: If one dies, they are out. Game ends if both out OR time up.
                // We'll let the other player play for score until time up? 
                // Or just end? Let's keep it simple: End if both dead.
            }
        }
    }

    draw();
    if (!paused) {
        requestAnimationFrame(gameLoop);
    }
}


// === Audio System ===
class MusicPlayer {
    constructor() {
        this.ctx = null;
        this.isPlaying = false;
        this.tempo = 120; // BPM
        this.noteIndex = 0;
        this.nextNoteTime = 0;
        this.timerID = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    play() {
        if (!this.enabled || !this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.noteIndex = 0;
        this.nextNoteTime = this.ctx.currentTime;
        this.scheduler();
    }

    stop() {
        this.isPlaying = false;
        clearTimeout(this.timerID);
    }

    scheduler() {
        if (!this.isPlaying) return;

        // Lookahead 0.1s
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.scheduleNote(this.noteIndex, this.nextNoteTime);
            this.nextNoteTime += this.getNoteDuration(this.noteIndex);
            this.noteIndex++;
            if (this.noteIndex >= JINGLE_BELLS.length) {
                this.noteIndex = 0; // Loop
            }
        }
        this.timerID = setTimeout(() => this.scheduler(), 25);
    }

    scheduleNote(index, time) {
        const noteData = JINGLE_BELLS[index];
        const freq = NOTES[noteData[0]];
        const duration = noteData[1] * (60 / this.tempo);

        if (!freq) return; // Rest

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square'; // 8-bit sound
        osc.frequency.value = freq;

        // Envelope
        gain.gain.setValueAtTime(0.05, time); // Low volume
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration - 0.05);
        gain.gain.setValueAtTime(0, time + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(time);
        osc.stop(time + duration);
    }

    getNoteDuration(index) {
        return JINGLE_BELLS[index][1] * (60 / this.tempo);
    }
}

// Note Frequencies
const NOTES = {
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
    'C6': 1046.50
};

// Jingle Bells (Simple) - Note, Beats
const JINGLE_BELLS = [
    ['E5', 1], ['E5', 1], ['E5', 2],
    ['E5', 1], ['E5', 1], ['E5', 2],
    ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5],
    ['E5', 4],
    ['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5],
    ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 0.5], ['E5', 0.5],
    ['E5', 1], ['D5', 1], ['D5', 1], ['E5', 1],
    ['D5', 2], ['G5', 2],
    // Repeat Top Logic
    ['E5', 1], ['E5', 1], ['E5', 2],
    ['E5', 1], ['E5', 1], ['E5', 2],
    ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5],
    ['E5', 4],
    ['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5],
    ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 0.5], ['E5', 0.5],
    ['G5', 1], ['G5', 1], ['F5', 1], ['D5', 1],
    ['C5', 4]
];

const music = new MusicPlayer();

// === State Managers ===
function startGame() {
    music.init(); // Init context context on user gesture
    if (music.enabled) music.play();

    gameOver = false;
    paused = false;
    gameStartTime = Date.now();

    // Create Players
    p1 = new Player(0);
    const p2Offset = (COLS * BLOCK_SIZE) + GAP;
    p2 = new Player(p2Offset, gameMode === '1p');

    // UI Updates
    document.getElementById('menu-overlay').classList.add('hidden');
    document.getElementById('game-over-overlay').classList.add('hidden');
    document.getElementById('touch-controls').classList.remove('hidden');

    // Adjust touch controls for 1P
    if (gameMode === '1p') {
        document.body.classList.add('mode-1p');
    } else {
        document.body.classList.remove('mode-1p');
    }

    resize();
    lastTime = 0;
    requestAnimationFrame(gameLoop);
}

function endGame() {
    music.stop();
    gameOver = true;
    const winnerText = document.getElementById('winner-text');

    let wStr = "It's a Draw!";
    if (p1.score > p2.score) wStr = "Player 1 Wins!";
    else if (p2.score > p1.score) wStr = (gameMode === '1p' ? "CPU Wins!" : "Player 2 Wins!");

    winnerText.textContent = wStr;

    document.getElementById('p1-score-final').textContent = p1.score;
    document.getElementById('p2-score-final').textContent = p2.score;

    document.getElementById('game-over-overlay').classList.remove('hidden');
    document.getElementById('touch-controls').classList.add('hidden');
}

function showMenu() {
    music.stop();
    document.getElementById('game-over-overlay').classList.add('hidden');
    document.getElementById('menu-overlay').classList.remove('hidden');
}

// Init
// Menu Interaction Setup
document.querySelectorAll('#mode-select .toggle-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('#mode-select .toggle-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        gameMode = btn.dataset.value;
    };
});

document.querySelectorAll('#time-select .toggle-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('#time-select .toggle-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        gameDuration = parseInt(btn.dataset.value);
    };
});

document.querySelectorAll('#music-select .toggle-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('#music-select .toggle-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        music.enabled = (btn.dataset.value === 'on');
    };
});

document.getElementById('start-game-btn').onclick = startGame;

updateTabletClass();
setupInputs();
resize();

// Initial Loop (Empty but draws background cleared)
requestAnimationFrame(gameLoop);
