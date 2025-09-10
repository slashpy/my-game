/* Falling Balls - Canvas Game */
(function() {
	'use strict';

	/** @type {HTMLCanvasElement} */
	const canvas = document.getElementById('game');
	/** @type {CanvasRenderingContext2D} */
	const ctx = canvas.getContext('2d');

	const overlay = document.getElementById('overlay');
	const startBtn = document.getElementById('start-btn');
	const scoreEl = document.getElementById('score');
	const livesEl = document.getElementById('lives');
	const overlayTitle = document.getElementById('overlay-title');
	const overlaySub = document.getElementById('overlay-sub');
	const bgm = document.getElementById('bgm');
	const deathBgm = document.getElementById('death-bgm');
	const pauseControls = document.getElementById('pause-controls');
	const toggleMusicBtn = document.getElementById('toggle-music');
	const comboEl = document.getElementById('combo');

	// Audio setup
	let audioContext = null;
	let hasPrimedAudio = false;
	function primeAudio() {
		if (hasPrimedAudio) return;
		hasPrimedAudio = true;
		try {
			if (!audioContext) {
				audioContext = new (window.AudioContext || window.webkitAudioContext)();
			}
			if (audioContext.state === 'suspended') {
				audioContext.resume().catch(() => {});
			}
			if (bgm && !bgm.muted) {
				bgm.play().catch(() => {});
			}
		} catch (_) {}
	}

	function setupFirstInteractionAudioPrime() {
		const once = () => {
			primeAudio();
			window.removeEventListener('pointerdown', once);
			window.removeEventListener('keydown', once);
		};
		window.addEventListener('pointerdown', once, { once: true });
		window.addEventListener('keydown', once, { once: true });
	}

	const GAME_WIDTH = canvas.width;
	const GAME_HEIGHT = canvas.height;

	// Hi-DPI scaling
	let deviceScale = Math.max(1, Math.floor(window.devicePixelRatio || 1));
	function resizeCanvasForHiDpi() {
		deviceScale = Math.max(1, Math.floor(window.devicePixelRatio || 1));
		const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
		const vh = Math.min(window.innerHeight, document.documentElement.clientHeight || window.innerHeight);
		const aspect = GAME_WIDTH / GAME_HEIGHT;
		let targetW = vw;
		let targetH = Math.floor(vw / aspect);
		if (targetH > vh - 140) {
			targetH = Math.max(300, vh - 140);
			targetW = Math.floor(targetH * aspect);
		}
		canvas.width = GAME_WIDTH * deviceScale;
		canvas.height = GAME_HEIGHT * deviceScale;
		canvas.style.width = targetW + 'px';
		canvas.style.height = targetH + 'px';
		ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
	}
	resizeCanvasForHiDpi();
	window.addEventListener('resize', resizeCanvasForHiDpi);

	const PADDLE_WIDTH = 148;
	const PADDLE_HEIGHT = 14;
	const PADDLE_Y = GAME_HEIGHT - 34;
	const PADDLE_SPEED = 420; // px/sec

	const BALL_MIN_RADIUS = 10;
	const BALL_MAX_RADIUS = 16;
	const BASE_BALL_MIN_SPEED = 150; // normal
	const BASE_BALL_MAX_SPEED = 300; // normal
	const BALL_SPAWN_INTERVAL_START = 1000; // ms
	const BALL_SPAWN_INTERVAL_MIN = 440; // ms

	const MAX_LIVES = 3;

	/** @typedef {{x:number,y:number,r:number,vy:number,color:string,caught:boolean,special?:boolean}} Ball */

	/** Game state */
	let paddleX = (GAME_WIDTH - PADDLE_WIDTH) / 2;
	let isLeftPressed = false;
	let isRightPressed = false;
	let mouseX = null;

	/** @type {Ball[]} */
	let balls = [];
	let lastSpawnAt = 0;
	let lastSpecialSpawnAt = 0;
	let spawnIntervalMs = BALL_SPAWN_INTERVAL_START;

	let score = 0;
	let lives = MAX_LIVES;
	let lastTime = 0;
	let running = false;
	let paused = false;
	let currentDifficulty = 'normal';
	let currentBallMinSpeed = BASE_BALL_MIN_SPEED;
	let currentBallMaxSpeed = BASE_BALL_MAX_SPEED;

	// Visual systems
	let shakeMag = 0;
	let shakeTime = 0;
	let enableStarfield = true;
	let enableTrails = true;
	let enableParticles = true;
	let enableShake = true;

	// Combo
	let comboMultiplier = 1;
	let comboTimer = 0; // seconds
	const COMBO_TIMEOUT = 2.0;

	// Special ball spawn interval
	const SPECIAL_SPAWN_INTERVAL_MS = 7000;

	// Particles
	/** @typedef {{x:number,y:number,vx:number,vy:number,life:number,maxLife:number,color:string}} Particle */
	/** @type {Particle[]} */
	let particles = [];

	// Starfield
	const stars = [];
	for (let i = 0; i < 120; i++) {
		stars.push({ x: Math.random() * GAME_WIDTH, y: Math.random() * GAME_HEIGHT, d: Math.random() * 2 + 0.5 });
	}

	function rand(min, max) {
		return Math.random() * (max - min) + min;
	}

	function choice(arr) {
		return arr[(Math.random() * arr.length) | 0];
	}

	function resetGame() {
		balls = [];
		lastSpawnAt = 0;
		lastSpecialSpawnAt = 0;
		spawnIntervalMs = BALL_SPAWN_INTERVAL_START;
		score = 0;
		lives = MAX_LIVES;
		paddleX = (GAME_WIDTH - PADDLE_WIDTH) / 2;
		comboMultiplier = 1;
		comboTimer = 0;
		shakeMag = 0;
		shakeTime = 0;
		particles = [];
		updateHud();
	}

	function updateHud() {
		scoreEl.textContent = `Score: ${score}`;
		livesEl.textContent = `Lives: ${lives}`;
		if (comboEl) comboEl.textContent = `Combo: x${comboMultiplier}`;
	}

	function spawnBall(now) {
		if (now - lastSpawnAt < spawnIntervalMs) return;
		lastSpawnAt = now;
		const r = rand(BALL_MIN_RADIUS, BALL_MAX_RADIUS);
		const x = rand(r + 4, GAME_WIDTH - r - 4);
		const color = choice([
			'#f9a8d4', /* pink */ '#bfdbfe', /* baby blue */ '#fde68a', /* soft yellow */ '#c4b5fd', /* lavender */ '#a7f3d0' /* mint */
		]);
		const vy = rand(currentBallMinSpeed, currentBallMaxSpeed);
		balls.push({ x, y: -r, r, vy, color, caught: false });
		// accelerate spawn rate slightly until min interval
		spawnIntervalMs = Math.max(BALL_SPAWN_INTERVAL_MIN, spawnIntervalMs * 0.985);
	}

	function spawnSpecialBall(now) {
		if (now - lastSpecialSpawnAt < SPECIAL_SPAWN_INTERVAL_MS) return;
		lastSpecialSpawnAt = now;
		const r = rand(BALL_MAX_RADIUS + 2, BALL_MAX_RADIUS + 6);
		const x = rand(r + 6, GAME_WIDTH - r - 6);
		const color = '#fbbf24';
		const vy = rand(currentBallMinSpeed * 1.05, currentBallMaxSpeed * 1.15);
		balls.push({ x, y: -r, r, vy, color, caught: false, special: true });
	}

	function update(dt, now) {
		// Move paddle
		const moveBy = PADDLE_SPEED * dt;
		if (mouseX !== null) {
			paddleX = mouseX - PADDLE_WIDTH / 2;
		} else if (isLeftPressed !== isRightPressed) {
			paddleX += (isRightPressed ? 1 : -1) * moveBy;
		}
		paddleX = Math.max(0, Math.min(GAME_WIDTH - PADDLE_WIDTH, paddleX));

		// Spawn balls
		spawnBall(now);
		spawnSpecialBall(now);

		// Update balls
		for (let i = 0; i < balls.length; i++) {
			const ball = balls[i];
			ball.y += ball.vy * dt;

			// Collision with paddle
			if (!ball.caught && ball.y + ball.r >= PADDLE_Y && ball.y - ball.r <= PADDLE_Y + PADDLE_HEIGHT) {
				const inX = ball.x + ball.r >= paddleX && ball.x - ball.r <= paddleX + PADDLE_WIDTH;
				if (inX) {
					ball.caught = true;
					comboMultiplier = Math.min(9, comboMultiplier + 1);
					comboTimer = COMBO_TIMEOUT;
					const base = ball.special ? 5 : 1;
					score += base * comboMultiplier;
					updateHud();
					playCatchSfx();
					if (ball.special) playMeowSfx();
					if (enableParticles) spawnCatchParticles(ball.x, Math.max(PADDLE_Y - 2, ball.y), ball.color);
				}
			}
		}

		// Remove off-screen balls and decrement lives if missed
		const remaining = [];
		for (const b of balls) {
			if (b.caught) continue; // remove caught
			if (b.y - b.r > GAME_HEIGHT) {
				lives -= 1;
				comboMultiplier = 1;
				comboTimer = 0;
				triggerShake(10, 200);
				updateHud();
				continue;
			}
			remaining.push(b);
		}
		balls = remaining;

		// Update combo decay
		if (comboMultiplier > 1) {
			comboTimer -= dt;
			if (comboTimer <= 0) {
				comboMultiplier = 1;
				updateHud();
			}
		}

		// Update particles
		if (enableParticles && particles.length) {
			const next = [];
			for (const p of particles) {
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				p.vy += 600 * dt * 0.2;
				p.life -= dt;
				if (p.life > 0) next.push(p);
			}
			particles = next;
		}

		// Update starfield
		if (enableStarfield) {
			for (const s of stars) {
				s.y += (18 + s.d * 22) * dt;
				if (s.y > GAME_HEIGHT) { s.y = -2; s.x = Math.random() * GAME_WIDTH; }
			}
		}

		// Update shake
		if (shakeTime > 0) {
			shakeTime -= dt * 1000;
			if (shakeTime <= 0) shakeMag = 0;
		}

		if (lives <= 0) {
			endGame();
		}
	}

	function draw() {
		ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

		// Apply screen shake
		if (enableShake && shakeMag > 0) {
			const dx = (Math.random() * 2 - 1) * shakeMag;
			const dy = (Math.random() * 2 - 1) * shakeMag;
			ctx.save();
			ctx.translate(dx, dy);
			drawScene();
			ctx.restore();
		} else {
			drawScene();
		}
	}

	function drawScene() {
		// Starfield
		if (enableStarfield) {
			ctx.save();
			ctx.globalAlpha = 0.5;
			ctx.fillStyle = '#93c5fd';
			for (const s of stars) {
				ctx.fillRect(s.x, s.y, 1.2 + s.d * 0.6, 1.2 + s.d * 0.6);
			}
			ctx.restore();
		}

		// Background grid
		ctx.save();
		ctx.globalAlpha = 0.06;
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 1;
		for (let y = 0; y < GAME_HEIGHT; y += 24) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(GAME_WIDTH, y);
			ctx.stroke();
		}
		ctx.restore();

		// Paddle
		ctx.fillStyle = '#fbcfe8';
		ctx.fillRect(paddleX, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT);
		// Paddle glow
		ctx.save();
		ctx.fillStyle = 'rgba(249,168,212,0.35)';
		ctx.filter = 'blur(6px)';
		ctx.fillRect(paddleX, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT);
		ctx.restore();

		// Particles
		if (enableParticles && particles.length) {
			ctx.save();
			for (const p of particles) {
				const a = p.life / p.maxLife;
				ctx.globalAlpha = Math.max(0, Math.min(1, a));
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, 2 + 2 * a, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.restore();
		}

		// Balls
		for (const ball of balls) {
			// trails
			if (enableTrails) {
				ctx.save();
				ctx.globalAlpha = 0.15;
				ctx.fillStyle = ball.color;
				for (let t = 1; t <= 3; t++) {
					const ty = ball.y - ball.vy * 0.02 * t;
					ctx.beginPath();
					ctx.arc(ball.x, ty, ball.r * (1 - t * 0.08), 0, Math.PI * 2);
					ctx.fill();
				}
				ctx.restore();
			}
			// special balls as cat faces, small balls as paws
			if (ball.special) {
				drawCatFace(ball.x, ball.y, ball.r, ball.color);
			} else if (ball.r <= 12) {
				drawPaw(ball.x, ball.y, ball.r, ball.color);
			} else {
				ctx.beginPath();
				ctx.fillStyle = ball.color;
				ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
				ctx.fill();
			}
			// subtle shadow
			ctx.save();
			ctx.globalAlpha = 0.3;
			ctx.fillStyle = '#000';
			ctx.filter = 'blur(4px)';
			ctx.beginPath();
			ctx.arc(ball.x + 2, ball.y + 2, ball.r, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	}

	function gameLoop(timestamp) {
		if (!running || paused) return;
		if (!lastTime) lastTime = timestamp;
		const dt = Math.min(0.033, (timestamp - lastTime) / 1000);
		lastTime = timestamp;

		update(dt, timestamp);
		draw();

		requestAnimationFrame(gameLoop);
	}

	function startGame() {
		running = true;
		lastTime = 0;
		resetGame();
		overlay.classList.add('hidden');
		paused = false;
		// Try to start background music; user interaction from button click allows play
		if (bgm) {
			bgm.currentTime = 0;
			bgm.volume = 0.4;
			bgm.play().catch((err) => {
				console.warn('BGM play blocked or failed:', err);
				// retry once shortly after in case of race with load
				setTimeout(() => {
					bgm.play().catch((e2) => console.warn('BGM retry failed:', e2));
				}, 300);
			});
		}
		if (deathBgm) { try { deathBgm.pause(); } catch(_) {} }
		document.body.classList.remove('grayscale');
		primeAudio();
		requestAnimationFrame(gameLoop);
	}

	function endGame() {
		running = false;
		if (bgm) { bgm.pause(); }
		if (deathBgm) { try { deathBgm.currentTime = 0; deathBgm.volume = 0.5; deathBgm.play().catch(() => {}); } catch(_) {} }
		document.body.classList.add('grayscale');
		overlayTitle.textContent = 'Game Over';
		overlaySub.textContent = `Your score: ${score}`;
		startBtn.textContent = 'Play again';
		overlay.classList.remove('hidden');
	}

	// Input
	window.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') isLeftPressed = true;
		if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') isRightPressed = true;
		if (e.key === 'Escape') {
			if (running) {
				if (!paused) {
					paused = true;
					overlayTitle.textContent = 'Paused';
					overlaySub.textContent = 'Press ESC to resume';
					startBtn.textContent = 'Resume';
					pauseControls.style.display = '';
					overlay.classList.remove('hidden');
					if (bgm && !bgm.muted) bgm.pause();
				} else {
					resumeGame();
				}
			}
		}
	});
	window.addEventListener('keyup', (e) => {
		if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') isLeftPressed = false;
		if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') isRightPressed = false;
	});

	canvas.addEventListener('mousemove', (e) => {
		const rect = canvas.getBoundingClientRect();
		mouseX = ((e.clientX - rect.left) / rect.width) * GAME_WIDTH;
	});
	canvas.addEventListener('mouseleave', () => { mouseX = null; });

	// Touch input
	canvas.addEventListener('touchstart', (e) => {
		if (e.touches.length > 0) {
			const rect = canvas.getBoundingClientRect();
			mouseX = ((e.touches[0].clientX - rect.left) / rect.width) * GAME_WIDTH;
		}
		startBtn.blur();
	}, { passive: true });
	canvas.addEventListener('touchmove', (e) => {
		if (e.touches.length > 0) {
			const rect = canvas.getBoundingClientRect();
			mouseX = ((e.touches[0].clientX - rect.left) / rect.width) * GAME_WIDTH;
		}
	}, { passive: true });
	canvas.addEventListener('touchend', () => { mouseX = null; });

	startBtn.addEventListener('click', () => {
		if (!running) {
			startGame();
		} else if (paused) {
			resumeGame();
		}
	});

	// Difficulty radio handling
	const difficultyRadios = Array.from(document.querySelectorAll('input[name="difficulty"]'));
	function applyDifficulty(d) {
		currentDifficulty = d;
		if (d === 'easy') {
			currentBallMinSpeed = BASE_BALL_MIN_SPEED * 0.8;
			currentBallMaxSpeed = BASE_BALL_MAX_SPEED * 0.8;
		} else if (d === 'hard') {
			currentBallMinSpeed = BASE_BALL_MIN_SPEED * 1.25;
			currentBallMaxSpeed = BASE_BALL_MAX_SPEED * 1.35;
		} else {
			currentBallMinSpeed = BASE_BALL_MIN_SPEED;
			currentBallMaxSpeed = BASE_BALL_MAX_SPEED;
		}
	}
	applyDifficulty('normal');
	difficultyRadios.forEach((r) => {
		r.addEventListener('change', (e) => {
			if (e.target.checked) applyDifficulty(e.target.value);
		});
	});

	// Music toggle
	if (toggleMusicBtn && bgm) {
		toggleMusicBtn.addEventListener('click', () => {
			bgm.muted = !bgm.muted;
			toggleMusicBtn.textContent = bgm.muted ? 'Play Music' : 'Mute Music';
			if (!bgm.muted && (paused || running)) {
				bgm.play().catch(() => {});
			}
		});
	}

	// Graphics toggles
	const starfieldCb = document.getElementById('gfx-starfield');
	const trailsCb = document.getElementById('gfx-trails');
	const particlesCb = document.getElementById('gfx-particles');
	const shakeCb = document.getElementById('gfx-shake');
	function syncGfx() {
		enableStarfield = starfieldCb ? starfieldCb.checked : true;
		enableTrails = trailsCb ? trailsCb.checked : true;
		enableParticles = particlesCb ? particlesCb.checked : true;
		enableShake = shakeCb ? shakeCb.checked : true;
	}
	[starfieldCb, trailsCb, particlesCb, shakeCb].forEach((el) => {
		if (!el) return;
		el.addEventListener('change', syncGfx);
	});
	syncGfx();

	// Show start overlay initially
	resetGame();
	overlay.classList.remove('hidden');

	function resumeGame() {
		paused = false;
		overlay.classList.add('hidden');
		pauseControls.style.display = 'none';
		if (bgm && !bgm.muted) {
			bgm.play().catch(() => {});
		}
		primeAudio();
		requestAnimationFrame(gameLoop);
	}

	// Simple catch SFX using WebAudio
	function playCatchSfx() {
		try {
			if (!audioContext) return;
			const now = audioContext.currentTime;
			const osc = audioContext.createOscillator();
			const gain = audioContext.createGain();
			osc.type = 'triangle';
			osc.frequency.setValueAtTime(700, now);
			osc.frequency.exponentialRampToValueAtTime(350, now + 0.08);
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.exponentialRampToValueAtTime(0.32, now + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
			osc.connect(gain).connect(audioContext.destination);
			osc.start(now);
			osc.stop(now + 0.13);
		} catch (_) {}
	}

	function playMeowSfx() {
		try {
			if (!audioContext) return;
			const now = audioContext.currentTime;
			const osc = audioContext.createOscillator();
			const gain = audioContext.createGain();
			osc.type = 'sawtooth';
			osc.frequency.setValueAtTime(520, now);
			osc.frequency.exponentialRampToValueAtTime(320, now + 0.28);
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.exponentialRampToValueAtTime(0.28, now + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
			osc.connect(gain).connect(audioContext.destination);
			osc.start(now);
			osc.stop(now + 0.34);
		} catch (_) {}
	}

	function drawCatFace(x, y, r, color) {
		ctx.save();
		// glow
		ctx.shadowColor = color;
		ctx.shadowBlur = 16;
		// face
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.shadowBlur = 0;
		// ears
		ctx.fillStyle = shade(color, -10);
		const earOffset = r * 0.6;
		const earSize = r * 0.9;
		ctx.beginPath();
		ctx.moveTo(x - earOffset, y - r * 0.3);
		ctx.lineTo(x - earOffset - earSize * 0.35, y - r * 0.9);
		ctx.lineTo(x - earOffset + earSize * 0.15, y - r * 0.8);
		ctx.closePath();
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo(x + earOffset, y - r * 0.3);
		ctx.lineTo(x + earOffset + earSize * 0.35, y - r * 0.9);
		ctx.lineTo(x + earOffset - earSize * 0.15, y - r * 0.8);
		ctx.closePath();
		ctx.fill();
		// eyes
		ctx.fillStyle = '#443c4a';
		ctx.beginPath();
		ctx.arc(x - r * 0.35, y - r * 0.1, r * 0.12, 0, Math.PI * 2);
		ctx.arc(x + r * 0.35, y - r * 0.1, r * 0.12, 0, Math.PI * 2);
		ctx.fill();
		// nose
		ctx.fillStyle = '#e29ab8';
		ctx.beginPath();
		ctx.arc(x, y + r * 0.05, r * 0.1, 0, Math.PI * 2);
		ctx.fill();
		// whiskers
		ctx.strokeStyle = '#6b6470';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(x - r * 0.2, y + r * 0.05);
		ctx.lineTo(x - r * 0.7, y);
		ctx.moveTo(x - r * 0.2, y + r * 0.1);
		ctx.lineTo(x - r * 0.7, y + r * 0.12);
		ctx.moveTo(x + r * 0.2, y + r * 0.05);
		ctx.lineTo(x + r * 0.7, y);
		ctx.moveTo(x + r * 0.2, y + r * 0.1);
		ctx.lineTo(x + r * 0.7, y + r * 0.12);
		ctx.stroke();
		ctx.restore();
	}

	function drawPaw(x, y, r, color) {
		ctx.save();
		ctx.fillStyle = color;
		// main pad
		ctx.beginPath();
		ctx.ellipse(x, y + r * 0.15, r * 0.9, r * 0.7, 0, 0, Math.PI * 2);
		ctx.fill();
		// toes
		const toeR = r * 0.35;
		ctx.beginPath();
		ctx.arc(x - r * 0.6, y - r * 0.2, toeR, 0, Math.PI * 2);
		ctx.arc(x, y - r * 0.35, toeR, 0, Math.PI * 2);
		ctx.arc(x + r * 0.6, y - r * 0.2, toeR, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	function shade(hex, percent) {
		try {
			const num = parseInt(hex.replace('#',''), 16);
			let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
			r = Math.min(255, Math.max(0, r + Math.round(255 * (percent/100))));
			g = Math.min(255, Math.max(0, g + Math.round(255 * (percent/100))));
			b = Math.min(255, Math.max(0, b + Math.round(255 * (percent/100))));
			return '#' + ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1);
		} catch (_) {
			return hex;
		}
	}

	function triggerShake(magnitude, durationMs) {
		if (!enableShake) return;
		shakeMag = magnitude / 10;
		shakeTime = durationMs;
	}

	function spawnCatchParticles(x, y, color) {
		for (let i = 0; i < 24; i++) {
			const a = Math.random() * Math.PI * 2;
			const s = Math.random() * 180 + 80;
			particles.push({
				x,
				y,
				vx: Math.cos(a) * s,
				vy: Math.sin(a) * s,
				life: 0.35 + Math.random() * 0.25,
				maxLife: 0.6,
				color
			});
		}
	}

	// Prepare audio priming listeners initially
	setupFirstInteractionAudioPrime();
})();

