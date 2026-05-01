// Lightweight visualisation primitives used by Insight. All functions take
// a CanvasRenderingContext2D and a numeric data buffer and paint into the
// canvas at its current pixel size. They are deliberately allocation-light
// to be safe at 60 fps.

/** Draw an oscilloscope-style time-domain plot from a Uint8Array (0..255). */
export function drawOscilloscope(ctx2d, data, opts = {}) {
  const w = ctx2d.canvas.width;
  const h = ctx2d.canvas.height;
  const stroke = opts.stroke || "rgba(56, 243, 163, 0.85)";
  const grid = opts.grid !== false;
  const fill = opts.fill || "rgba(56, 243, 163, 0.05)";
  ctx2d.clearRect(0, 0, w, h);
  if (grid) {
    ctx2d.strokeStyle = "rgba(150,140,200,0.10)";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(0, h / 2); ctx2d.lineTo(w, h / 2);
    ctx2d.stroke();
  }
  if (!data || !data.length) return;
  ctx2d.fillStyle = fill;
  ctx2d.fillRect(0, 0, w, h);
  ctx2d.strokeStyle = stroke;
  ctx2d.lineWidth = opts.lineWidth || 1.5;
  ctx2d.beginPath();
  const step = data.length / w;
  for (let x = 0; x < w; x += 1) {
    const v = data[Math.floor(x * step)] / 255;
    const y = (1 - v) * h;
    if (x === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();
}

/** Draw a spectrum bar plot from a Uint8Array (FFT magnitudes 0..255). */
export function drawSpectrum(ctx2d, data, opts = {}) {
  const w = ctx2d.canvas.width;
  const h = ctx2d.canvas.height;
  ctx2d.clearRect(0, 0, w, h);
  if (!data || !data.length) return;
  const usable = Math.floor(data.length * (opts.maxRatio || 0.6));
  const bars = Math.min(opts.bars || 64, usable);
  const slot = w / bars;
  const accent1 = "rgba(192, 132, 255, 0.85)";
  const accent2 = "rgba(56, 243, 163, 0.65)";
  const grad = ctx2d.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, accent1);
  grad.addColorStop(1, accent2);
  ctx2d.fillStyle = grad;
  for (let i = 0; i < bars; i += 1) {
    let sum = 0; let count = 0;
    const start = Math.floor(i * usable / bars);
    const end = Math.floor((i + 1) * usable / bars);
    for (let j = start; j < end; j += 1) { sum += data[j]; count += 1; }
    const v = (count > 0 ? sum / count : 0) / 255;
    const bh = Math.max(1, v * h);
    ctx2d.fillRect(i * slot + 1, h - bh, Math.max(1, slot - 2), bh);
  }
}

/**
 * Draw a theoretical voice waveform across one period for the given control
 * register / frequency / pulse width. Pure visualisation - this is *not* the
 * actual SID output, but it gives a tactile preview of the voice shape.
 */
export function drawVoiceShape(ctx2d, { control, freq, pulseWidth, level, color, gateOverlay = true }) {
  const w = ctx2d.canvas.width;
  const h = ctx2d.canvas.height;
  ctx2d.clearRect(0, 0, w, h);
  ctx2d.fillStyle = "rgba(7, 9, 13, 0.78)";
  ctx2d.fillRect(0, 0, w, h);
  ctx2d.strokeStyle = "rgba(207,220,235,0.14)";
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  ctx2d.moveTo(0, h / 2); ctx2d.lineTo(w, h / 2);
  ctx2d.stroke();

  const tri = (control & 0x10) !== 0;
  const saw = (control & 0x20) !== 0;
  const pul = (control & 0x40) !== 0;
  const noi = (control & 0x80) !== 0;
  const gate = (control & 0x01) !== 0;
  const test = (control & 0x08) !== 0;
  const lvl = Math.max(0, Math.min(1, level == null ? 1 : level));
  const amp = (h / 2 - 4) * lvl;
  const yMid = h / 2;
  const cycles = 2; // show two cycles for legibility

  ctx2d.lineWidth = 2.6;
  ctx2d.strokeStyle = color || "rgba(56, 243, 163, 0.95)";
  ctx2d.beginPath();
  if (test || (!tri && !saw && !pul && !noi)) {
    ctx2d.moveTo(0, yMid); ctx2d.lineTo(w, yMid);
  } else if (noi && !tri && !saw && !pul) {
    // pseudo-random noise - deterministic for a given freq so it isn't jittery
    let seed = (freq | 0) ^ 0x1ABC;
    for (let x = 0; x < w; x += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const v = ((seed >>> 12) & 0xff) / 255 * 2 - 1;
      const y = yMid - v * amp;
      if (x === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
    }
  } else {
    const duty = ((pulseWidth & 0x0FFF) / 4096) || 0.5;
    for (let x = 0; x < w; x += 1) {
      const t = (x / w) * cycles;
      const phase = t - Math.floor(t); // 0..1
      let v = 0; let n = 0;
      if (tri) {
        const triVal = phase < 0.5 ? (phase * 4 - 1) : (3 - phase * 4);
        v += triVal; n += 1;
      }
      if (saw) {
        v += (phase * 2 - 1); n += 1;
      }
      if (pul) {
        v += phase < duty ? 1 : -1; n += 1;
      }
      if (n > 0) v /= n;
      const y = yMid - v * amp;
      if (x === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
    }
  }
  ctx2d.stroke();

  // little gate indicator
  if (gateOverlay && !gate) {
    ctx2d.fillStyle = "rgba(255,125,107,0.16)";
    ctx2d.fillRect(0, 0, w, h);
  }
}

/**
 * Draw a small filter response (bode-ish) for the given mode/cutoff/resonance.
 * cutoffHz absolute, resonance 0..1, modes = { lp, bp, hp }.
 */
export function drawFilterResponse(ctx2d, { cutoffHz, resonance, lp, bp, hp }) {
  const w = ctx2d.canvas.width;
  const h = ctx2d.canvas.height;
  ctx2d.clearRect(0, 0, w, h);

  // grid lines
  ctx2d.strokeStyle = "rgba(150,140,200,0.10)";
  ctx2d.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (h / 4) * i;
    ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(w, y); ctx2d.stroke();
  }

  const fmin = 30;
  const fmax = 16000;
  const noMode = !lp && !bp && !hp;
  const Q = 0.5 + Math.max(0, Math.min(1, resonance || 0)) * 8;
  const fc = Math.max(fmin, Math.min(fmax, cutoffHz || 1000));

  // cutoff marker
  const xCut = Math.round((Math.log(fc / fmin) / Math.log(fmax / fmin)) * w);
  ctx2d.strokeStyle = "rgba(255,206,92,0.45)";
  ctx2d.setLineDash([3, 3]);
  ctx2d.beginPath(); ctx2d.moveTo(xCut, 0); ctx2d.lineTo(xCut, h); ctx2d.stroke();
  ctx2d.setLineDash([]);

  // response
  ctx2d.lineWidth = 2;
  ctx2d.strokeStyle = noMode ? "rgba(150,140,200,0.45)" : "rgba(106, 215, 255, 0.85)";
  ctx2d.beginPath();
  for (let x = 0; x < w; x += 1) {
    const t = x / w;
    const f = fmin * Math.pow(fmax / fmin, t);
    const r = f / fc;
    let mag = 0;
    if (noMode) {
      mag = 1; // bypass passes everything
    } else {
      // sum the active filter modes (parallel) the way SID does it.
      let m = 0;
      if (lp) m += 1 / Math.sqrt(1 + Math.pow(r, 4));
      if (bp) m += (r / Q) / Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / Q, 2));
      if (hp) m += (r * r) / Math.sqrt(1 + Math.pow(r, -4));
      // resonance bump near cutoff
      const bump = resonance ? Math.max(0, 1 - Math.abs(Math.log(r))) * resonance * 1.2 : 0;
      mag = Math.min(2.0, m + bump);
    }
    const y = h - Math.min(h - 2, mag * h * 0.45);
    if (x === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();

  // labels
  ctx2d.fillStyle = "rgba(200,194,230,0.5)";
  ctx2d.font = "10px ui-monospace, monospace";
  ctx2d.fillText(`${Math.round(fc)} Hz`, Math.min(w - 60, xCut + 4), 12);
}

/**
 * Resize a canvas so it draws crisply on devicePixelRatio displays. The
 * caller is expected to call this once per layout pass before drawing.
 */
export function fitCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const targetW = Math.max(1, Math.floor(rect.width * ratio));
  const targetH = Math.max(1, Math.floor(rect.height * ratio));
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
}
