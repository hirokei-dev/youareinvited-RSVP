/* ============================================================
   ANIMATED BACKGROUND — 8 modes
   Change mode with: window.setBgMode('particles')
   Modes: particles | bokeh | snow | stars | petals | waves | constellation | none
   ============================================================ */

(function () {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  let particles = [];
  let accentColor = '185, 164, 139';
  let mode = 'particles';
  let raf = null;
  let time = 0;

  // ---------- theme color ----------
  function readAccent() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim();
    if (raw.startsWith('#')) {
      const hex = raw.replace('#', '');
      const bigint = parseInt(hex.length === 3
        ? hex.split('').map(c => c + c).join('') : hex, 16);
      accentColor = `${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}`;
    } else if (raw.startsWith('rgb')) {
      const n = raw.match(/\d+/g);
      if (n) accentColor = `${n[0]}, ${n[1]}, ${n[2]}`;
    }
  }

  // ---------- sizing ----------
  function resize() {
    W = canvas.clientWidth = window.innerWidth;
    H = canvas.clientHeight = window.innerHeight;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    spawn();
  }

  // ---------- particle factories ----------
  function rand(a, b) { return Math.random() * (b - a) + a; }

  function spawn() {
    const density = Math.min(Math.floor((W * H) / 22000), 90);
    particles = [];
    for (let i = 0; i < density; i++) particles.push(makeParticle());
  }

  function makeParticle() {
    return {
      x: rand(0, W),
      y: rand(0, H),
      r: rand(0.6, 2.8),
      vx: rand(-0.18, 0.18),
      vy: rand(-0.18, 0.18) - 0.05,
      a: rand(0.15, 0.5),
      phase: rand(0, Math.PI * 2),
      spin: rand(-0.01, 0.01)
    };
  }

  // ---------- render modes ----------
  const modes = {

    // 1. Particles — soft floating dots (original)
    particles(t) {
      for (const p of particles) {
        p.phase += 0.005;
        p.x += p.vx + Math.sin(p.phase) * 0.15;
        p.y += p.vy + Math.cos(p.phase * 0.8) * 0.12;
        wrap(p);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        g.addColorStop(0, `rgba(${accentColor}, ${p.a})`);
        g.addColorStop(1, `rgba(${accentColor}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(${accentColor}, ${p.a + 0.15})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    },

    // 2. Bokeh — larger, blurrier orbs
    bokeh(t) {
      for (const p of particles) {
        p.phase += 0.003;
        p.x += p.vx * 0.5 + Math.sin(p.phase) * 0.1;
        p.y += p.vy * 0.5 - 0.02;
        wrap(p);
        const R = p.r * 12;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
        g.addColorStop(0, `rgba(${accentColor}, ${p.a * 0.6})`);
        g.addColorStop(0.6, `rgba(${accentColor}, ${p.a * 0.2})`);
        g.addColorStop(1, `rgba(${accentColor}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
      }
    },

    // 3. Snow — downward flakes with sway
    snow(t) {
      for (const p of particles) {
        p.phase += 0.01;
        p.y += p.r * 0.35 + 0.2;
        p.x += Math.sin(p.phase) * 0.6;
        if (p.y > H + 10) { p.y = -10; p.x = rand(0, W); }
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        ctx.fillStyle = `rgba(${accentColor}, ${p.a + 0.2})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    },

    // 4. Stars — twinkling in place
    stars(t) {
      for (const p of particles) {
        const twinkle = 0.4 + Math.abs(Math.sin(p.phase + t * 0.001)) * 0.6;
        ctx.fillStyle = `rgba(${accentColor}, ${p.a * twinkle})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.2, 0, Math.PI * 2); ctx.fill();
      }
    },

    // 5. Petals — rotating ellipses falling
    petals(t) {
      for (const p of particles) {
        p.phase += 0.008;
        p.y += 0.4 + p.r * 0.15;
        p.x += Math.sin(p.phase) * 0.5;
        if (p.y > H + 20) { p.y = -20; p.x = rand(0, W); }
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.phase);
        ctx.fillStyle = `rgba(${accentColor}, ${p.a})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 3, p.r * 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },

    // 6. Waves — slow horizontal sine bands
    waves(t) {
      const bands = 5;
      for (let b = 0; b < bands; b++) {
        ctx.beginPath();
        const amp = 30 + b * 12;
        const yOff = H * (0.25 + b * 0.15);
        const speed = 0.0004 + b * 0.0002;
        for (let x = 0; x <= W; x += 6) {
          const y = yOff + Math.sin(x * 0.008 + t * speed * 1000) * amp;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${accentColor}, ${0.08 + b * 0.02})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    },

    // 7. Constellation — dots linked when close
    constellation(t) {
      for (const p of particles) {
        p.phase += 0.004;
        p.x += p.vx * 0.5 + Math.sin(p.phase) * 0.08;
        p.y += p.vy * 0.5 + Math.cos(p.phase * 0.9) * 0.08;
        wrap(p);
      }
      // lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 130 * 130) {
            const alpha = (1 - Math.sqrt(d2) / 130) * 0.15;
            ctx.strokeStyle = `rgba(${accentColor}, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      // dots
      for (const p of particles) {
        ctx.fillStyle = `rgba(${accentColor}, ${p.a + 0.2})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    },

    // 8. None — solid background, no animation
    none() { /* intentionally blank */ }
  };

  function wrap(p) {
    if (p.x < -10) p.x = W + 10;
    if (p.x > W + 10) p.x = -10;
    if (p.y < -10) p.y = H + 10;
    if (p.y > H + 10) p.y = -10;
  }

  // ---------- main loop ----------
  function tick(t) {
    time = t;
    ctx.clearRect(0, 0, W, H);
    (modes[mode] || modes.particles)(t);
    raf = requestAnimationFrame(tick);
  }

  function start() {
    cancelAnimationFrame(raf);
    readAccent();
    resize();
    if (reduceMotion || mode === 'none') {
      ctx.clearRect(0, 0, W, H);
      if (mode !== 'none') (modes[mode] || modes.particles)(0);
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  // ---------- public API ----------
  window.setBgMode = function (newMode) {
    if (!modes[newMode]) return;
    mode = newMode;
    start();
  };
  window.getBgMode = function () { return mode; };

  window.addEventListener('resize', () => { cancelAnimationFrame(raf); start(); });
  window.addEventListener('themeChanged', () => { readAccent(); });

  start();
})();