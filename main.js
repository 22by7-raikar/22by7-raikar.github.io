// ---------- theme ----------
const root = document.documentElement;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
};
const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
const themeBtn = document.getElementById("theme");
const setTheme = (t) => { root.dataset.theme = t; themeBtn.textContent = t === "light" ? "☾" : "☀"; };
setTheme(store.get("theme") || (prefersLight ? "light" : "dark"));
themeBtn.addEventListener("click", () => {
  setTheme(root.dataset.theme === "light" ? "dark" : "light");
  store.set("theme", root.dataset.theme);
  readColors();
});

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- typewriter tagline ----------
(() => {
  const el = document.getElementById("typed");
  const lines = [
    "I build robots that see, hear, and move.",
    "LiDAR + cameras + microphones → decisions.",
    "From raw sensor data to safe motion.",
    "Perceive → estimate → plan → control.",
  ];
  if (reduceMotion) return;
  let li = 0, ci = lines[0].length, deleting = true;
  const tick = () => {
    const line = lines[li];
    if (deleting) {
      ci--;
      if (ci === 0) { deleting = false; li = (li + 1) % lines.length; }
    } else {
      ci++;
      if (ci === lines[li].length) { deleting = true; el.textContent = lines[li]; return setTimeout(tick, 2600); }
    }
    el.textContent = (deleting ? line : lines[li]).slice(0, ci);
    setTimeout(tick, deleting ? 22 : 45);
  };
  setTimeout(tick, 3000);
})();

// ---------- project filters ----------
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const f = chip.dataset.f;
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === chip));
    document.querySelectorAll("#grid .card").forEach((card) => {
      card.classList.toggle("hide", f !== "all" && !card.dataset.tags.split(" ").includes(f));
    });
    document.querySelectorAll(".more li").forEach((li) => {
      li.classList.toggle("dim", f !== "all" && !li.dataset.tags.split(" ").includes(f));
    });
  });
});

// ---------- LiDAR scene ----------
const canvas = document.getElementById("scan");
const ctx = canvas.getContext("2d");
let colors = {};
function readColors() {
  const s = getComputedStyle(root);
  colors = {
    ground: s.getPropertyValue("--cyan").trim(),
    objs: [s.getPropertyValue("--pink").trim(), s.getPropertyValue("--amber").trim(), s.getPropertyValue("--green").trim()],
    light: root.dataset.theme === "light",
  };
}
readColors();

// Deterministic random so the scene looks the same on every visit.
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const boxes = [
  // x, y, yaw, length, width, height, colour index
  [9, 3.5, 0.1, 4.4, 1.9, 1.5, 0], [-7, 4, 0.05, 4.6, 2.0, 1.6, 1], [14, -4, 1.62, 4.2, 1.8, 1.5, 0],
  [-12, -5, 0.0, 9, 2.5, 3.0, 1], [4, -7, 0.3, 0.6, 0.6, 1.8, 2], [-3, 9, 0.0, 0.6, 0.6, 1.7, 2],
  [20, 6, 0.2, 4.4, 1.9, 1.5, 0], [-18, 9, 1.5, 4.4, 1.9, 1.5, 0],
];
const pts = [];
const inBox = (x, y) => boxes.some(([bx, by, yaw, l, w]) => {
  const dx = x - bx, dy = y - by, c = Math.cos(-yaw), s = Math.sin(-yaw);
  return Math.abs(dx * c - dy * s) < l / 2 && Math.abs(dx * s + dy * c) < w / 2;
});
// ground: concentric scan rings, like a spinning multi-beam LiDAR
for (let r = 3; r < 34; r *= 1.075) {
  const n = Math.floor(r * 22);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand() * 0.004;
    const x = r * Math.cos(a), y = r * Math.sin(a);
    if (!inBox(x, y)) pts.push({ x, y, z: (rand() - 0.5) * 0.05, a: (a + Math.PI * 2) % (Math.PI * 2), c: -1 });
  }
}
// objects: points on box surfaces
boxes.forEach(([bx, by, yaw, l, w, h, ci], bi) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const n = Math.floor((l + w) * h * 22);
  for (let k = 0; k < n; k++) {
    let u = (rand() - 0.5) * l, v = (rand() - 0.5) * w;
    if (rand() < 0.5) u = Math.sign(u || 1) * l / 2; else v = Math.sign(v || 1) * w / 2;
    const z = rand() * h;
    const x = bx + u * c - v * s, y = by + u * s + v * c;
    pts.push({ x, y, z, a: (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2), c: ci, b: bi });
  }
});
const boxAngle = boxes.map(([bx, by]) => (Math.atan2(by, bx) + Math.PI * 2) % (Math.PI * 2));

let W = 0, H = 0, dpr = 1, mx = 0, my = 0, tmx = 0, tmy = 0;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();
window.addEventListener("pointermove", (e) => { tmx = e.clientX / W - 0.5; tmy = e.clientY / H - 0.5; });

const SPEED = 1.6; // rad/s sweep
function draw(t) {
  mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
  const wide = W > 900;
  const cx = wide ? W * 0.7 : W * 0.5, cy = wide ? H * 0.56 : H * 0.92;
  const yaw = t * 0.05 + mx * 1.2, pitch = 1.02 + my * 0.35;
  const f = Math.min(W, H) * (wide ? 1.0 : 0.9), D = 30;
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const proj = (x, y, z) => {
    const xr = x * cyw - y * syw, yr = x * syw + y * cyw;
    const depth = D + yr * cp - z * sp;
    const zz = yr * sp + z * cp;
    return [cx + (f * xr) / depth, cy - (f * zz) / depth, depth];
  };
  const sweep = (t * SPEED) % (Math.PI * 2);
  const age = (a) => (((sweep - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / SPEED;

  ctx.clearRect(0, 0, W, H);
  const base = colors.light ? 0.1 : 0.12, fade = wide ? 1 : 0.4;
  // keep the scene quiet behind the text column
  const textFade = (sx) => (wide ? 0.06 + 0.94 * Math.min(1, Math.max(0, (sx - W * 0.5) / (W * 0.18))) : 1);
  for (const p of pts) {
    const [sx, sy, d] = proj(p.x, p.y, p.z);
    if (d < 2 || sx < -5 || sx > W + 5 || sy < -5 || sy > H + 5) continue;
    const b = Math.exp(-age(p.a) / 1.1);
    ctx.globalAlpha = (base + (1 - base) * b) * fade * textFade(sx);
    ctx.fillStyle = p.c < 0 ? colors.ground : colors.objs[p.c];
    const s = p.c < 0 ? 1.3 : 1.7;
    ctx.fillRect(sx, sy, s, s);
  }
  // detection boxes light up after the beam passes, then fade
  ctx.lineWidth = 1.4;
  boxes.forEach(([bx, by, yw, l, w, h, ci], i) => {
    const k = Math.max(0, 1 - age(boxAngle[i]) / 2.6);
    if (k <= 0) return;
    const c = Math.cos(yw), s = Math.sin(yw);
    const corners = [];
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = bx + (u * l / 2) * c - (v * w / 2) * s, y = by + (u * l / 2) * s + (v * w / 2) * c;
      corners.push(proj(x, y, 0), proj(x, y, h));
    }
    const [bsx] = proj(bx, by, 0);
    ctx.globalAlpha = k * 0.95 * fade * textFade(bsx);
    ctx.strokeStyle = colors.objs[ci];
    ctx.beginPath();
    for (let j = 0; j < 4; j++) {
      const a0 = corners[j * 2], a1 = corners[j * 2 + 1], b0 = corners[((j + 1) % 4) * 2], b1 = corners[((j + 1) % 4) * 2 + 1];
      ctx.moveTo(a0[0], a0[1]); ctx.lineTo(b0[0], b0[1]);
      ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]);
      ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]);
    }
    ctx.stroke();
  });
  // the sensor
  const [ox, oy] = proj(0, 0, 0.3);
  ctx.globalAlpha = fade;
  ctx.fillStyle = colors.ground;
  ctx.beginPath(); ctx.arc(ox, oy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

let visible = true;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
if (reduceMotion) {
  draw(2);
} else {
  const loop = (ms) => { if (visible) draw(ms / 1000); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
