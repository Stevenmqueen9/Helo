(() => {
    const canvas = document.getElementById("bonus-canvas");
    const ctx = canvas.getContext("2d");

    // ---------- Utils ----------
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    function now() { return performance.now(); }

    // ---------- Game ----------
    class BonusGame {
        constructor(canvas, ctx) {
            this.canvas = canvas;
            this.ctx = ctx;

            this.state = "idle"; // idle | playing | victory
            this.molotovsLeft = 10;
            this.hits = 0;

            this.molotovs = [];
            this.particles = [];      // explosion sparks
            this.fireParticles = [];  // flame tongues
            this.smokeParticles = []; // smoke blobs
            this.embers = [];         // glowing embers

            this.fireLevel = 0; // 0..10 (visual intensity)
            this.fireTarget = 0;

            this.victoryT = 0;

            this.lastT = now();
            this.dt = 0;

            this.cameraShake = 0;
            this.cameraShakeDecay = 4.5;

            this.cached = {
                sky: null,
                ground: null,
                vignette: null,
            };

            this.ui = {
                throwBtn: document.getElementById("throw-btn"),
                molotovCount: document.getElementById("molotov-count"),
                hitsCount: document.getElementById("hits-count"),
            };

            // IMPORTANT: no leak listeners
            this.ui.throwBtn.onclick = () => this.throwMolotov();

            this.resize();
            window.addEventListener("resize", () => this.resize(), { passive: true });
        }

        resize() {
            const w = Math.min(900, window.innerWidth - 40);
            const h = Math.min(700, Math.floor(window.innerHeight * 0.7));
            this.canvas.width = Math.max(320, w);
            this.canvas.height = Math.max(320, h);

            this.cached.sky = null;
            this.cached.ground = null;
            this.cached.vignette = null;
        }

        init() {
            this.state = "playing";
            this.molotovsLeft = 10;
            this.hits = 0;

            this.molotovs.length = 0;
            this.particles.length = 0;
            this.fireParticles.length = 0;
            this.smokeParticles.length = 0;
            this.embers.length = 0;

            this.fireLevel = 0;
            this.fireTarget = 0;
            this.victoryT = 0;

            this.cameraShake = 0;

            this.ui.throwBtn.disabled = false;
            this.ui.throwBtn.innerText = "Lancia 🔥";

            this.updateHUD();
            this.lastT = now();
            requestAnimationFrame(() => this.loop());
        }

        updateHUD() {
            this.ui.molotovCount.innerText = `Molotov: ${this.molotovsLeft}`;
            this.ui.hitsCount.innerText = `Colpi: ${this.hits}`;

            if (this.state === "playing" && this.molotovsLeft <= 0) {
                this.ui.throwBtn.disabled = true;
                this.ui.throwBtn.innerText = "🎉 Finito!";
                // vai in victory dopo 0.8s
                setTimeout(() => {
                    if (this.state === "playing") this.state = "victory";
                }, 800);
            }
        }

        // --- Geometry ---
        getCharacterPos() {
            return {
                x: 130,
                y: this.canvas.height - 210,
            };
        }

        getBuildingRect() {
            // building anchored bottom-right
            const w = 210;
            const h = 260;
            const x = this.canvas.width - (w + 55);
            const y = this.canvas.height - (h + 95);
            return { x, y, w, h };
        }

        // --- Throw ---
        throwMolotov() {
            if (this.state !== "playing") return;
            if (this.molotovsLeft <= 0) return;

            this.molotovsLeft--;
            this.updateHUD();

            const start = this.getCharacterPos();
            const target = this.getBuildingRect();

            // mira a una zona variabile sul palazzo (più naturale)
            const tx = target.x + rand(target.w * 0.25, target.w * 0.85);
            const ty = target.y + rand(target.h * 0.25, target.h * 0.85);

            // traiettoria balistica “bella”: tempo di volo fisso e vy iniziale calcolata
            const flight = 0.95; // secondi
            const g = 1400;      // px/s^2

            const vx = (tx - start.x) / flight;
            const vy = (ty - start.y + 0.5 * g * flight * flight) / flight;

            this.molotovs.push({
                x: start.x,
                y: start.y,
                vx,
                vy: -vy,
                g,
                r: 0,
                vr: rand(-12, 12),
                alive: true,
                radius: 8,
            });
        }

        // --- FX Spawns ---
        impact(x, y) {
            this.hits++;
            this.fireTarget = clamp(this.fireTarget + 1, 0, 10);
            this.updateHUD();

            // screen shake
            this.cameraShake = clamp(this.cameraShake + 12, 0, 28);

            this.spawnExplosion(x, y);
            this.spawnFireBurst(x, y);
            this.spawnSmokeBurst(x, y);
            this.spawnEmbers(x, y);
        }

        spawnExplosion(x, y) {
            const n = 60;
            for (let i = 0; i < n; i++) {
                const a = rand(0, Math.PI * 2);
                const s = rand(220, 780);
                this.particles.push({
                    x, y,
                    vx: Math.cos(a) * s,
                    vy: Math.sin(a) * s - rand(50, 260),
                    life: rand(0.35, 0.75),
                    size: rand(2, 6),
                    drag: rand(1.8, 3.5),
                    gravity: rand(900, 1300),
                    kind: Math.random() < 0.55 ? "hot" : "gold",
                });
            }
            this.capArray(this.particles, 700);
        }

        spawnFireBurst(x, y) {
            for (let i = 0; i < 24; i++) {
                this.fireParticles.push({
                    x: x + rand(-10, 10),
                    y: y + rand(-6, 6),
                    vx: rand(-110, 110),
                    vy: rand(-520, -210),
                    life: rand(0.25, 0.6),
                    size: rand(10, 26),
                    wobble: rand(3, 9),
                    seed: Math.random() * 1000,
                });
            }
            this.capArray(this.fireParticles, 420);
        }

        spawnSmokeBurst(x, y) {
            for (let i = 0; i < 12; i++) {
                this.smokeParticles.push({
                    x: x + rand(-18, 18),
                    y: y + rand(-10, 10),
                    vx: rand(-60, 60),
                    vy: rand(-220, -90),
                    life: rand(0.9, 1.6),
                    size: rand(18, 45),
                    grow: rand(18, 42),
                    alpha: rand(0.25, 0.55),
                    twist: rand(-2.4, 2.4),
                });
            }
            this.capArray(this.smokeParticles, 380);
        }

        spawnEmbers(x, y) {
            for (let i = 0; i < 26; i++) {
                this.embers.push({
                    x: x + rand(-8, 8),
                    y: y + rand(-8, 8),
                    vx: rand(-160, 160),
                    vy: rand(-520, -220),
                    life: rand(0.6, 1.2),
                    size: rand(1.5, 3.8),
                    gravity: rand(760, 1040),
                    flicker: rand(10, 20),
                });
            }
            this.capArray(this.embers, 420);
        }

        capArray(arr, max) {
            if (arr.length > max) arr.splice(0, arr.length - max);
        }

        // --- Update ---
        update(dt) {
            // fire smoothing
            this.fireLevel = lerp(this.fireLevel, this.fireTarget, clamp(dt * 2.2, 0, 1));
            // leggero decadimento del target col tempo (così non rimane per sempre al massimo)
            this.fireTarget = clamp(this.fireTarget - dt * 0.10, 0, 10);

            // camera shake decay
            this.cameraShake = Math.max(0, this.cameraShake - dt * this.cameraShakeDecay * 10);

            // molotovs
            const b = this.getBuildingRect();
            for (let i = this.molotovs.length - 1; i >= 0; i--) {
                const m = this.molotovs[i];
                m.vy += m.g * dt;
                m.x += m.vx * dt;
                m.y += m.vy * dt;
                m.r += m.vr * dt;

                // collision (circle vs rect)
                const cx = clamp(m.x, b.x, b.x + b.w);
                const cy = clamp(m.y, b.y, b.y + b.h);
                const dx = m.x - cx;
                const dy = m.y - cy;
                if (dx * dx + dy * dy <= (m.radius * m.radius)) {
                    this.molotovs.splice(i, 1);
                    this.impact(m.x, m.y);
                    continue;
                }

                // offscreen cleanup
                if (m.y > this.canvas.height + 140 || m.x < -200 || m.x > this.canvas.width + 200) {
                    this.molotovs.splice(i, 1);
                }
            }

            // particles (sparks)
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.vx -= p.vx * p.drag * dt;
                p.vy += p.gravity * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life -= dt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }

            // fire particles
            for (let i = this.fireParticles.length - 1; i >= 0; i--) {
                const p = this.fireParticles[i];
                p.seed += dt * 4;
                const w = Math.sin(p.seed) * p.wobble;
                p.vx -= p.vx * 2.1 * dt;
                p.vy += 820 * dt; // “sale” ma si spegne con gravità invertita leggera? qui facciamo cadere poco: effetto lingua
                p.x += (p.vx + w * 6) * dt;
                p.y += (p.vy - 980) * dt; // spinta verso l’alto
                p.life -= dt;
                if (p.life <= 0) this.fireParticles.splice(i, 1);
            }

            // smoke
            for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
                const s = this.smokeParticles[i];
                s.x += (s.vx + Math.sin(s.twist) * 24) * dt;
                s.y += s.vy * dt;
                s.size += s.grow * dt;
                s.twist += dt * 2.2;
                s.life -= dt;
                if (s.life <= 0) this.smokeParticles.splice(i, 1);
            }

            // embers
            for (let i = this.embers.length - 1; i >= 0; i--) {
                const e = this.embers[i];
                e.vy += e.gravity * dt;
                e.x += e.vx * dt;
                e.y += e.vy * dt;
                e.life -= dt;
                if (e.life <= 0) this.embers.splice(i, 1);
            }

            // victory anim time
            if (this.state === "victory") {
                this.victoryT = clamp(this.victoryT + dt, 0, 3.0);
            }
        }

        // --- Render base layers (cached gradients) ---
        ensureBackgroundCache() {
            if (!this.cached.sky) {
                const g = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
                g.addColorStop(0, "#76B6FF");
                g.addColorStop(0.55, "#BFE6FF");
                g.addColorStop(1, "#EAF8FF");
                this.cached.sky = g;
            }
            if (!this.cached.ground) {
                const gy = this.canvas.height - 80;
                const g = ctx.createLinearGradient(0, gy, 0, this.canvas.height);
                g.addColorStop(0, "#7BDA7D");
                g.addColorStop(1, "#4FB35B");
                this.cached.ground = g;
            }
            if (!this.cached.vignette) {
                const v = ctx.createRadialGradient(
                    this.canvas.width * 0.5, this.canvas.height * 0.55, this.canvas.height * 0.15,
                    this.canvas.width * 0.5, this.canvas.height * 0.55, this.canvas.height * 0.9
                );
                v.addColorStop(0, "rgba(0,0,0,0)");
                v.addColorStop(1, "rgba(0,0,0,0.22)");
                this.cached.vignette = v;
            }
        }

        // --- Render ---
        render() {
            this.ensureBackgroundCache();

            // camera shake
            const shake = this.cameraShake;
            const sx = shake ? rand(-shake, shake) : 0;
            const sy = shake ? rand(-shake, shake) : 0;

            ctx.save();
            ctx.translate(sx, sy);

            // sky
            ctx.fillStyle = this.cached.sky;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // subtle clouds (cheap)
            this.drawClouds();

            // ground
            ctx.fillStyle = this.cached.ground;
            ctx.fillRect(0, this.canvas.height - 80, this.canvas.width, 80);

            // parallax city silhouette
            this.drawCitySilhouette();

            // building + fire
            const b = this.getBuildingRect();
            this.drawBuilding(b);
            this.drawFire(b);

            if (this.state === "playing") {
                // character
                const c = this.getCharacterPos();
                this.drawCharacter(c.x, c.y);

                // molotovs
                for (const m of this.molotovs) this.drawMolotov(m);

            } else if (this.state === "victory") {
                this.drawVictoryScene();
            }

            // particles (front)
            this.drawParticles();

            // vignette
            ctx.fillStyle = this.cached.vignette;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            ctx.restore();
        }

        drawClouds() {
            const t = now() * 0.00005;
            ctx.save();
            ctx.globalAlpha = 0.16;
            for (let i = 0; i < 6; i++) {
                const x = (this.canvas.width * ((i * 0.18 + t) % 1)) - 120;
                const y = 60 + i * 22;
                ctx.fillStyle = "#fff";
                ctx.beginPath();
                ctx.ellipse(x, y, 70, 18, 0, 0, Math.PI * 2);
                ctx.ellipse(x + 50, y + 8, 50, 15, 0, 0, Math.PI * 2);
                ctx.ellipse(x - 40, y + 10, 45, 14, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        drawCitySilhouette() {
            const baseY = this.canvas.height - 110;
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = "#1A2B3D";
            for (let i = 0; i < 18; i++) {
                const w = randInt(18, 40);
                const h = randInt(40, 120);
                const x = i * 55 + (Math.sin(now() * 0.0001 + i) * 3);
                ctx.fillRect(x, baseY - h, w, h);
            }
            ctx.restore();
        }

        // ---------- Drawing: Building ----------
        drawBuilding(b) {
            // 3D body
            const depth = 26;
            const front = { x: b.x, y: b.y, w: b.w, h: b.h };
            const side = {
                x: b.x + b.w,
                y: b.y + 10,
                w: depth,
                h: b.h - 10
            };
            const top = {
                x1: b.x, y1: b.y,
                x2: b.x + b.w, y2: b.y,
                x3: b.x + b.w + depth, y3: b.y + 10,
                x4: b.x + depth, y4: b.y + 10
            };

            // shadow on ground
            ctx.save();
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = "#000";
            ctx.beginPath();
            ctx.ellipse(b.x + b.w * 0.55, this.canvas.height - 85, b.w * 0.62, 18, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // side
            const sideGrad = ctx.createLinearGradient(side.x, side.y, side.x + side.w, side.y);
            sideGrad.addColorStop(0, "#D9A36A");
            sideGrad.addColorStop(1, "#B97A3E");
            ctx.fillStyle = sideGrad;
            ctx.fillRect(side.x, side.y, side.w, side.h);

            // top
            const topGrad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + 18);
            topGrad.addColorStop(0, "#FFE2C2");
            topGrad.addColorStop(1, "#E8B27A");
            ctx.fillStyle = topGrad;
            ctx.beginPath();
            ctx.moveTo(top.x1, top.y1);
            ctx.lineTo(top.x2, top.y2);
            ctx.lineTo(top.x3, top.y3);
            ctx.lineTo(top.x4, top.y4);
            ctx.closePath();
            ctx.fill();

            // front
            const frontGrad = ctx.createLinearGradient(front.x, front.y, front.x, front.y + front.h);
            frontGrad.addColorStop(0, "#FFD9B0"); // arancione chiaro sabbia
            frontGrad.addColorStop(1, "#E2A66B"); // ombra più calda ma NON fuoco   
            ctx.fillStyle = frontGrad;
            ctx.fillRect(front.x, front.y, front.w, front.h);

            // neon sign
            const signText = "KANDU";
            const sx = front.x + front.w * 0.16;
            const sy = front.y + 50;
            this.drawNeonSign(sx, sy, signText);

            // windows
            this.drawWindows(front);

            // door
            this.drawDoor(front);

            // outline
            ctx.strokeStyle = "rgba(0,0,0,0.35)";
            ctx.lineWidth = 3;
            ctx.strokeRect(front.x, front.y, front.w, front.h);
        }

        drawNeonSign(x, y, text) {
            ctx.save();
            ctx.font = "bold 28px sans-serif";
            ctx.textBaseline = "top";
            ctx.textAlign = "left";

            // glow
            ctx.shadowColor = "rgba(255, 0, 120, 0.9)";
            ctx.shadowBlur = 18;
            ctx.fillStyle = "rgba(255, 120, 200, 1)";
            ctx.fillText(text, x, y);

            // core
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#fff";
            ctx.globalAlpha = 0.75;
            ctx.fillText(text, x, y);
            ctx.restore();
        }

        drawWindows(front) {
            const cols = 5;
            const rows = 6;
            const padX = 16;
            const padY = 18;
            const wx = (front.w - padX * 2) / cols;
            const wy = (front.h - 120) / rows;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const x = front.x + padX + c * wx + 6;
                    const y = front.y + 90 + r * wy;
                    const w = wx - 14;
                    const h = wy - 14;

                    // some windows lit
                    const lit = Math.random() < 0.25;
                    const base = lit ? "rgba(255, 220, 120, 0.75)" : "rgba(30, 40, 55, 0.55)";

                    // glass gradient
                    const g = ctx.createLinearGradient(x, y, x + w, y + h);
                    g.addColorStop(0, base);
                    g.addColorStop(1, "rgba(255,255,255,0.06)");
                    ctx.fillStyle = g;
                    ctx.fillRect(x, y, w, h);

                    // frame
                    ctx.strokeStyle = "rgba(0,0,0,0.35)";
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, w, h);

                    // reflection
                    ctx.globalAlpha = 0.18;
                    ctx.fillStyle = "#fff";
                    ctx.fillRect(x + 3, y + 3, 3, h - 6);
                    ctx.globalAlpha = 1;
                }
            }
        }

        drawDoor(front) {
            const x = front.x + front.w * 0.38;
            const y = front.y + front.h - 62;
            const w = front.w * 0.24;
            const h = 62;

            const g = ctx.createLinearGradient(x, y, x, y + h);
            g.addColorStop(0, "#1A1E28");
            g.addColorStop(1, "#0E1118");
            ctx.fillStyle = g;
            ctx.fillRect(x, y, w, h);

            // handle
            ctx.fillStyle = "rgba(255, 220, 120, 0.8)";
            ctx.fillRect(x + w - 12, y + 28, 4, 10);

            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
        }

        // ---------- Fire on building ----------
        drawFire(b) {
            const lvl = this.fireLevel; // 0..10
            if (lvl <= 0.05) return;

            const intensity = lvl / 10;

            // glow overlay on building (cheap bloom-like)
            ctx.save();
            ctx.globalAlpha = 0.18 + 0.25 * intensity;
            ctx.fillStyle = "rgba(255, 90, 0, 0.35)";
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.restore();

            // deterministic hotspots (always same positions)
            const spots = this.getFireSpots(b);

            // draw flames
            for (let i = 0; i < Math.floor(lvl); i++) {
                const s = spots[i];
                const flick = Math.sin(now() * 0.012 + i) * (6 + 10 * intensity);
                const size = 18 + 22 * intensity + i * 0.6;

                // outer
                const og = ctx.createRadialGradient(s.x, s.y + flick, 0, s.x, s.y + flick, size + 18);
                og.addColorStop(0, "rgba(255, 230, 160, 0.95)");
                og.addColorStop(0.35, "rgba(255, 130, 20, 0.80)");
                og.addColorStop(0.7, "rgba(255, 60, 0, 0.35)");
                og.addColorStop(1, "rgba(255, 0, 0, 0)");
                ctx.fillStyle = og;
                ctx.beginPath();
                ctx.arc(s.x, s.y + flick, size + 16, 0, Math.PI * 2);
                ctx.fill();

                // inner core
                const ig = ctx.createRadialGradient(s.x, s.y + flick - 8, 0, s.x, s.y + flick - 8, size);
                ig.addColorStop(0, "rgba(255, 255, 220, 1)");
                ig.addColorStop(0.5, "rgba(255, 210, 80, 0.9)");
                ig.addColorStop(1, "rgba(255, 120, 0, 0)");
                ctx.fillStyle = ig;
                ctx.beginPath();
                ctx.arc(s.x, s.y + flick - 8, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        getFireSpots(b) {
            // 10 fixed positions across facade
            return [
                { x: b.x + b.w * 0.20, y: b.y + b.h * 0.65 },
                { x: b.x + b.w * 0.52, y: b.y + b.h * 0.42 },
                { x: b.x + b.w * 0.80, y: b.y + b.h * 0.72 },
                { x: b.x + b.w * 0.32, y: b.y + b.h * 0.32 },
                { x: b.x + b.w * 0.70, y: b.y + b.h * 0.52 },
                { x: b.x + b.w * 0.40, y: b.y + b.h * 0.84 },
                { x: b.x + b.w * 0.62, y: b.y + b.h * 0.22 },
                { x: b.x + b.w * 0.12, y: b.y + b.h * 0.50 },
                { x: b.x + b.w * 0.90, y: b.y + b.h * 0.40 },
                { x: b.x + b.w * 0.52, y: b.y + b.h * 0.92 },
            ];
        }

        // ---------- Character ----------
        drawCharacter(x, y) {
            // y è “top” del personaggio
            ctx.save();

            // shadow
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.beginPath();
            ctx.ellipse(x, this.canvas.height - 85, 30, 10, 0, 0, Math.PI * 2);
            ctx.fill();

            // legs
            ctx.fillStyle = "#3E6FE6";
            ctx.fillRect(x - 13, y + 110, 11, 48);
            ctx.fillRect(x + 2, y + 110, 11, 48);

            ctx.fillStyle = "rgba(0,0,0,0.18)";
            ctx.fillRect(x - 13, y + 110, 3, 48);
            ctx.fillRect(x + 2, y + 110, 3, 48);

            // shoes
            ctx.fillStyle = "#6B3A1F";
            ctx.fillRect(x - 16, y + 158, 14, 8);
            ctx.fillRect(x + 2, y + 158, 14, 8);

            // body (shirt)
            const bg = ctx.createLinearGradient(x - 20, y + 55, x + 20, y + 115);
            bg.addColorStop(0, "#FF72C7");
            bg.addColorStop(1, "#FF2D9C");
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.ellipse(x, y + 88, 20, 28, 0, 0, Math.PI * 2);
            ctx.fill();

            // neck
            ctx.fillStyle = "#F7D9B8";
            ctx.fillRect(x - 5, y + 56, 10, 12);

            // arms
            ctx.strokeStyle = "#F7D9B8";
            ctx.lineWidth = 10;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x - 18, y + 76);
            ctx.lineTo(x - 38, y + 103);
            ctx.moveTo(x + 18, y + 76);
            ctx.lineTo(x + 38, y + 103);
            ctx.stroke();

            // face
            const fg = ctx.createRadialGradient(x - 6, y + 32, 6, x, y + 36, 26);
            fg.addColorStop(0, "#FFE4C8");
            fg.addColorStop(1, "#F0CFA7");
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.arc(x, y + 36, 24, 0, Math.PI * 2);
            ctx.fill();

            // hair
            const hg = ctx.createLinearGradient(x - 26, y + 10, x + 26, y + 56);
            hg.addColorStop(0, "#FFD86A");
            hg.addColorStop(0.5, "#FFC84A");
            hg.addColorStop(1, "#FFB62E");
            ctx.fillStyle = hg;

            ctx.beginPath();
            ctx.arc(x - 16, y + 22, 20, 0, Math.PI * 2);
            ctx.arc(x + 16, y + 22, 20, 0, Math.PI * 2);
            ctx.arc(x, y + 18, 23, 0, Math.PI * 2);
            ctx.fill();

            // long hair
            ctx.fillRect(x - 28, y + 34, 10, 44);
            ctx.fillRect(x + 18, y + 34, 10, 44);

            // eyes
            ctx.fillStyle = "#141414";
            ctx.beginPath();
            ctx.ellipse(x - 9, y + 36, 3.2, 4.2, 0, 0, Math.PI * 2);
            ctx.ellipse(x + 9, y + 36, 3.2, 4.2, 0, 0, Math.PI * 2);
            ctx.fill();

            // highlights
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(x - 8, y + 34, 1.4, 0, Math.PI * 2);
            ctx.arc(x + 10, y + 34, 1.4, 0, Math.PI * 2);
            ctx.fill();

            // smile
            ctx.strokeStyle = "#D61A52";
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.arc(x, y + 48, 10, 0.2, Math.PI - 0.2);
            ctx.stroke();

            // blush
            ctx.fillStyle = "rgba(255, 160, 180, 0.45)";
            ctx.beginPath();
            ctx.ellipse(x - 16, y + 44, 6, 3.5, 0, 0, Math.PI * 2);
            ctx.ellipse(x + 16, y + 44, 6, 3.5, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        // ---------- Molotov ----------
        drawMolotov(m) {
            ctx.save();
            ctx.translate(m.x, m.y);
            ctx.rotate(m.r);

            // bottle shadow
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.fillRect(-6, -12, 12, 22);

            // glass
            const g = ctx.createLinearGradient(-7, -12, 7, 10);
            g.addColorStop(0, "rgba(120, 255, 160, 0.85)");
            g.addColorStop(0.5, "rgba(70, 200, 120, 0.85)");
            g.addColorStop(1, "rgba(50, 160, 90, 0.85)");
            ctx.fillStyle = g;
            ctx.fillRect(-7, -12, 14, 24);

            // highlight
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            ctx.fillRect(-5.5, -10, 3, 18);

            // neck
            ctx.fillStyle = "rgba(190, 255, 210, 0.85)";
            ctx.fillRect(-3.5, -18, 7, 6);

            // wick
            ctx.fillStyle = "#EEE";
            ctx.fillRect(-2, -26, 4, 10);

            // flame
            const f = ctx.createRadialGradient(0, -28, 1, 0, -30, 10);
            f.addColorStop(0, "rgba(255, 255, 200, 1)");
            f.addColorStop(0.5, "rgba(255, 190, 70, 0.95)");
            f.addColorStop(1, "rgba(255, 70, 0, 0)");
            ctx.fillStyle = f;
            ctx.beginPath();
            ctx.arc(0, -28, 9, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        // ---------- Particles ----------
        drawParticles() {
            // sparks
            for (const p of this.particles) {
                const a = clamp(p.life * 1.7, 0, 1);
                ctx.globalAlpha = a;
                const color = p.kind === "hot" ? "rgba(255,110,20,1)" : "rgba(255,220,120,1)";
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }

            // embers (glowy)
            for (const e of this.embers) {
                const a = clamp(e.life, 0, 1);
                ctx.globalAlpha = a;
                ctx.shadowColor = "rgba(255, 140, 40, 0.9)";
                ctx.shadowBlur = e.flicker;
                ctx.fillStyle = "rgba(255, 190, 80, 1)";
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // fire
            for (const p of this.fireParticles) {
                const a = clamp(p.life * 2.2, 0, 1);
                ctx.globalAlpha = a;
                const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                g.addColorStop(0, "rgba(255, 240, 180, 1)");
                g.addColorStop(0.45, "rgba(255, 140, 30, 0.9)");
                g.addColorStop(1, "rgba(255, 40, 0, 0)");
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }

            // smoke
            ctx.shadowBlur = 0;
            for (const s of this.smokeParticles) {
                const a = clamp(s.life / 1.6, 0, 1) * s.alpha;
                ctx.globalAlpha = a;
                const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
                g.addColorStop(0, "rgba(70, 70, 70, 0.7)");
                g.addColorStop(1, "rgba(70, 70, 70, 0)");
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.globalAlpha = 1;
        }

        // ---------- Victory ----------
        drawVictoryScene() {
            const t = this.victoryT; // 0..3
            const p = easeOutCubic(clamp(t / 1.2, 0, 1));

            const cx = this.canvas.width / 2;
            const cy = this.canvas.height / 2 + 40;

            // confetti-ish sparkles
            ctx.save();
            ctx.globalAlpha = 0.45 * p;
            for (let i = 0; i < 70; i++) {
                const x = cx + Math.sin(i * 12.32 + now() * 0.002) * rand(30, 240);
                const y = cy + Math.cos(i * 9.72 + now() * 0.002) * rand(30, 180);
                ctx.fillStyle = `rgba(${randInt(180, 255)},${randInt(120, 255)},${randInt(120, 255)},0.9)`;
                ctx.fillRect(x, y, 3, 3);
            }
            ctx.restore();

            // Lola centered
            this.drawCharacter(cx, cy - 150);

            // kids (simple, but smoother)
            const kidsAlpha = clamp((t - 0.5) / 0.8, 0, 1);
            ctx.save();
            ctx.globalAlpha = kidsAlpha;
            this.drawChild(cx - 110, cy + 30, "#7A3E1B", "#3E6FE6");
            this.drawChild(cx + 110, cy + 30, "#FFD86A", "#FF72C7");
            this.drawChild(cx - 55, cy + 42, "#111", "#7BDA7D");
            this.drawChild(cx + 55, cy + 42, "#D61A52", "#FFD86A");
            ctx.restore();

            // speech bubble
            const bubbleA = clamp((t - 1.1) / 0.6, 0, 1);
            if (bubbleA > 0) {
                ctx.save();
                ctx.globalAlpha = bubbleA;
                this.drawSpeechBubble(cx, cy - 140, "Ti vogliamo bene Lola! ❤️");
                ctx.restore();
            }
        }

        drawChild(x, y, hair, shirt) {
            ctx.save();
            // body
            ctx.fillStyle = shirt;
            ctx.fillRect(x - 9, y + 22, 18, 28);

            // head
            ctx.fillStyle = "#F7D9B8";
            ctx.beginPath();
            ctx.arc(x, y + 12, 11, 0, Math.PI * 2);
            ctx.fill();

            // hair
            ctx.fillStyle = hair;
            ctx.beginPath();
            ctx.arc(x - 6, y + 7, 9, 0, Math.PI * 2);
            ctx.arc(x + 6, y + 7, 9, 0, Math.PI * 2);
            ctx.arc(x, y + 5, 10, 0, Math.PI * 2);
            ctx.fill();

            // eyes
            ctx.fillStyle = "#111";
            ctx.beginPath();
            ctx.arc(x - 4, y + 12, 2, 0, Math.PI * 2);
            ctx.arc(x + 4, y + 12, 2, 0, Math.PI * 2);
            ctx.fill();

            // smile
            ctx.strokeStyle = "#111";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y + 16, 5, 0, Math.PI);
            ctx.stroke();

            // arms raised
            ctx.strokeStyle = "#F7D9B8";
            ctx.lineWidth = 5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x - 9, y + 26);
            ctx.lineTo(x - 16, y + 14);
            ctx.moveTo(x + 9, y + 26);
            ctx.lineTo(x + 16, y + 14);
            ctx.stroke();

            // legs
            ctx.strokeStyle = "#3E6FE6";
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(x - 4, y + 50);
            ctx.lineTo(x - 4, y + 66);
            ctx.moveTo(x + 4, y + 50);
            ctx.lineTo(x + 4, y + 66);
            ctx.stroke();

            ctx.restore();
        }

        drawSpeechBubble(x, y, text) {
            const pad = 18;
            const w = 320;
            const h = 92;

            ctx.save();

            // shadow
            ctx.fillStyle = "rgba(0,0,0,0.22)";
            ctx.beginPath();
            ctx.roundRect(x - w / 2 + 6, y - h + 6, w, h, 18);
            ctx.fill();

            // bubble
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = "rgba(0,0,0,0.75)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(x - w / 2, y - h, w, h, 18);
            ctx.fill();
            ctx.stroke();

            // tail
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.moveTo(x - 30, y);
            ctx.lineTo(x - 46, y + 20);
            ctx.lineTo(x - 8, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // text
            ctx.fillStyle = "#D61A52";
            ctx.font = "bold 26px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, x, y - h / 2);

            ctx.restore();
        }

        // ---------- Loop ----------
        loop() {
            const t = now();
            this.dt = clamp((t - this.lastT) / 1000, 0, 0.033); // max ~30fps step
            this.lastT = t;

            if (this.state !== "idle") {
                this.update(this.dt);
                this.render();
                requestAnimationFrame(() => this.loop());
            }
        }
    }

    // Expose init
    window.initBonusGame = function () {
        const game = new BonusGame(canvas, ctx);
        // salva per debug se serve
        window.__bonusGame = game;
        game.init();
    };
})();
