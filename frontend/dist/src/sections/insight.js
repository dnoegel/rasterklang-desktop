import { el, clear, fmtHex } from "../lib/ui.js";
import { currentTrack } from "../lib/catalog.js?v=dev";
import { pill, sectionHead } from "../lib/view-components.js?v=dev";
import { drawFilterResponse, drawOscilloscope, drawSpectrum, drawVoiceShape, fitCanvas } from "../lib/scope.js";
import {
  REGISTER_MAP,
  decodeADSR,
  decodeControl,
  decodeFilterRouting,
  decodeVolumeMode,
  describeWaveforms,
  freqToHz,
  pwToDuty,
  cutoffToHz,
  noteName,
  VOICE_COLORS,
} from "../lib/sid-spec.js";

export function mount(host, ctx) {
  const regs = new Uint8Array(32);
  let snap = ctx.engine.getLastSnapshot() || null;
  let raf = 0;

  const title = el("h1", {}, "Insight");
  const subtitle = el("p", {}, "Live analysis of the current SID track.");
  const pills = el("div", { class: "pill-row" });
  const hero = el("section", { class: "insight-hero" }, [
    el("div", {}, [el("p", { class: "kicker" }, "Live"), title, subtitle, pills]),
    audition(ctx),
  ]);
  host.append(hero);

  const timeCanvas = el("canvas");
  const spectrumCanvas = el("canvas");
  host.append(sectionHead("Audio"));
  host.append(el("div", { class: "insight-audio-grid" }, [
    scopeCard("Oscilloscope", timeCanvas),
    scopeCard("Frequency spectrum", spectrumCanvas),
  ]));

  host.append(sectionHead("Voices"));
  const voiceCards = [0, 1, 2].map((index) => voiceCard(index));
  host.append(el("div", { class: "voice-grid" }, voiceCards.map((card) => card.node)));

  host.append(sectionHead("Filter"));
  const filter = filterCard();
  host.append(filter.node);

  host.append(sectionHead("SID Register"));
  const heatmap = registerHeatmap();
  host.append(heatmap.node);

  function syncFromSnapshot(next) {
    snap = next || snap;
    const sid = snap?.SID || snap?.sid;
    const registers = sid?.Registers || sid?.registers;
    if (registers?.length >= 32) {
      for (let i = 0; i < 32; i += 1) regs[i] = Number(registers[i]) & 0xff;
    }
    paintHeader();
    paintVoices(sid);
    paintFilter(filter);
    paintHeatmap(heatmap);
  }

  const off = [
    ctx.events.on("engine.snapshot", syncFromSnapshot),
    ctx.events.on("engine.tune.loaded", () => {
      regs.fill(0);
      paintHeader();
      paintHeatmap(heatmap);
    }),
    ctx.events.on("engine.state", paintHeader),
    ctx.events.on("engine.audio.controls", paintHeader),
  ];

  function loop() {
    raf = requestAnimationFrame(loop);
    drawAudio();
  }
  raf = requestAnimationFrame(loop);
  syncFromSnapshot(snap);

  return {
    unmount() {
      if (raf) cancelAnimationFrame(raf);
      off.forEach((fn) => fn());
    },
  };

  function paintHeader() {
    const track = currentTrack(ctx);
    const state = ctx.engine.snapshot();
    title.textContent = track?.title || state.tune?.metadata?.title || "Insight";
    subtitle.textContent = track
      ? `${track.artist} - ${track.author || track.hvscPath}`
      : "Start a SID track to see live data.";
    clear(pills);
    pills.append(
      pill("Status", state.playing ? (state.paused ? "Paused" : "Live") : "Ready"),
      pill("Subtune", String(state.currentSubtune || track?.defaultSubtune || 1)),
      pill("Clock", track?.clock || state.tune?.metadata?.clock || "--"),
      pill("SID", track?.model || state.tune?.metadata?.sidModel || "--"),
    );
  }

  function drawAudio() {
    const { analyser, buffer } = ctx.engine.getAnalyser();
    fitCanvas(timeCanvas);
    fitCanvas(spectrumCanvas);
    const timeCtx = timeCanvas.getContext("2d");
    const spectrumCtx = spectrumCanvas.getContext("2d");
    if (!analyser) {
      timeCtx.clearRect(0, 0, timeCanvas.width, timeCanvas.height);
      spectrumCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
      return;
    }
    analyser.getByteTimeDomainData(buffer);
    drawOscilloscope(timeCtx, buffer, { stroke: "rgba(56,243,163,0.95)" });
    const freq = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freq);
    drawSpectrum(spectrumCtx, freq, { bars: 96, maxRatio: 0.75 });
  }

  function paintVoices(sid) {
    const voices = sid?.Voices || sid?.voices;
    for (let index = 0; index < 3; index += 1) {
      const card = voiceCards[index];
      const base = index * 7;
      const voice = voices?.[index] || {};
      const frequency = Number(voice.Frequency ?? voice.frequency ?? ((regs[base + 1] << 8) | regs[base]));
      const pulseWidth = Number(voice.PulseWidth ?? voice.pulseWidth ?? (((regs[base + 3] & 0x0f) << 8) | regs[base + 2]));
      const control = Number(voice.Control ?? voice.control ?? regs[base + 4]);
      const env = Number(voice.EnvelopeLevel ?? voice.envelopeLevel ?? 0);
      const adsr = decodeADSR(regs[base + 5], regs[base + 6]);
      const ctrl = decodeControl(control);
      const hz = freqToHz(frequency);
      const wfs = describeWaveforms(control).join(" + ");
      const active = ctrl.gate || env > 4;
      const color = cssColor(VOICE_COLORS[index + 1]);
      card.note.textContent = hz > 8 ? noteFromHz(hz) : "--";
      card.freq.textContent = `${hz.toFixed(1)} Hz`;
      card.wave.textContent = wfs;
      card.gate.textContent = ctrl.gate ? "Gate on" : "Gate off";
      card.adsr.textContent = `A${adsr.attack} D${adsr.decay} S${adsr.sustain} R${adsr.release}`;
      card.pulse.textContent = `${Math.round(pwToDuty(pulseWidth) * 100)}% PW`;
      card.activity.dataset.active = active ? "true" : "false";
      card.activity.title = active ? "Voice active" : "Voice inactive";
      fitCanvas(card.oscCanvas);
      drawVoiceShape(card.oscCanvas.getContext("2d"), {
        control,
        freq: frequency,
        pulseWidth,
        level: env ? Math.max(0.45, env / 255) : 0.72,
        color,
        gateOverlay: false,
      });
      fitCanvas(card.spectrumCanvas);
      drawVoiceSpectrum(card.spectrumCanvas.getContext("2d"), {
        control,
        pulseWidth,
        gate: active,
        color,
      });
    }
  }

  function paintFilter(card) {
    const cutoffRaw = ((regs[0x16] & 0xff) << 3) | (regs[0x15] & 0x07);
    const cutoffHz = cutoffToHz(cutoffRaw);
    const reson = decodeFilterRouting(regs[0x17]);
    const vol = decodeVolumeMode(regs[0x18]);
    const modes = [vol.lp && "LP", vol.bp && "BP", vol.hp && "HP"].filter(Boolean).join(" + ") || "Bypass";
    const route = [reson.filt1 && "V1", reson.filt2 && "V2", reson.filt3 && "V3", reson.filtX && "EXT"].filter(Boolean).join(", ") || "-";
    card.cutoff.textContent = `${Math.round(cutoffHz)} Hz`;
    card.resonance.textContent = `${reson.resonance}/15`;
    card.mode.textContent = modes;
    card.route.textContent = route;
    card.volume.textContent = `${vol.volume}/15`;
    fitCanvas(card.canvas);
    drawFilterResponse(card.canvas.getContext("2d"), {
      cutoffHz,
      resonance: reson.resonance / 15,
      lp: vol.lp,
      bp: vol.bp,
      hp: vol.hp,
    });
  }

  function paintHeatmap(map) {
    map.cells.forEach((cell, index) => {
      const registerIndex = cell.index ?? index;
      const value = regs[registerIndex] || 0;
      cell.value.textContent = `$${fmtHex(value)}`;
      cell.node.style.setProperty("--heat", String(value / 255));
    });
  }
}

function audition(ctx) {
  const state = ctx.engine.getAudioControls?.() || { voiceMask: 7, filterBypass: false };
  const rows = [0, 1, 2].map((index) => {
    const btn = el("button", {
      class: "voice-toggle",
      onclick: () => {
        const now = ctx.engine.getAudioControls();
        const bit = 1 << index;
        const next = (now.voiceMask & bit) ? (now.voiceMask & ~bit) : (now.voiceMask | bit);
        ctx.engine.setAudioControls({ voiceMask: next });
        paint();
      },
    }, `V${index + 1}`);
    return btn;
  });
  const filter = el("button", {
    class: "voice-toggle",
    onclick: () => {
      const now = ctx.engine.getAudioControls();
      ctx.engine.setAudioControls({ filterBypass: !now.filterBypass });
      paint();
    },
  }, "Filter");
  const node = el("div", { class: "audition-panel" }, [
    el("strong", {}, "Mix"),
    el("div", { class: "voice-toggle-row" }, [...rows, filter]),
  ]);

  function paint() {
    const controls = ctx.engine.getAudioControls?.() || state;
    rows.forEach((btn, index) => {
      btn.dataset.active = (controls.voiceMask & (1 << index)) ? "true" : "false";
    });
    filter.dataset.active = controls.filterBypass ? "false" : "true";
  }
  ctx.events.on("engine.audio.controls", paint);
  paint();
  return node;
}

function scopeCard(title, canvas) {
  return el("div", { class: "insight-card insight-card--scope" }, [
    el("h3", {}, title),
    el("div", { class: "insight-scope" }, [canvas]),
  ]);
}

function voiceCard(index) {
  const oscCanvas = el("canvas");
  const spectrumCanvas = el("canvas");
  const activity = el("span", {
    class: "voice-card__activity",
    style: { "--voice-color": VOICE_COLORS[index + 1] },
    title: "Voice inactive",
  });
  const node = el("div", { class: "insight-card voice-card" }, [
    el("div", { class: "voice-card__summary" }, [
      el("div", { class: "voice-card__head" }, [
        el("strong", {}, `Voice ${index + 1}`),
        activity,
      ]),
      el("div", { class: "voice-card__note" }),
      el("div", { class: "voice-card__meta" }),
      el("div", { class: "voice-card__chips" }),
    ]),
    el("div", { class: "voice-card__visuals" }, [
      el("div", { class: "voice-card__panel" }, [
        el("span", {}, "Oscillator"),
        el("div", { class: "voice-card__canvas" }, [oscCanvas]),
      ]),
      el("div", { class: "voice-card__panel" }, [
        el("span", {}, "Spectrum"),
        el("div", { class: "voice-card__canvas" }, [spectrumCanvas]),
      ]),
    ]),
  ]);
  const note = node.querySelector(".voice-card__note");
  const meta = node.querySelector(".voice-card__meta");
  const chips = node.querySelector(".voice-card__chips");
  const freq = el("span", {});
  const wave = el("span", {});
  const gate = el("span", {});
  const adsr = el("span", {});
  const pulse = el("span", {});
  meta.append(freq, wave);
  chips.append(gate, adsr, pulse);
  return { node, oscCanvas, spectrumCanvas, activity, note, freq, wave, gate, adsr, pulse };
}

function drawVoiceSpectrum(ctx2d, { control, pulseWidth, gate, color }) {
  const w = ctx2d.canvas.width;
  const h = ctx2d.canvas.height;
  const ctrl = decodeControl(control);
  const duty = Math.max(0.02, Math.min(0.98, pwToDuty(pulseWidth) || 0.5));
  const harmonics = 28;
  ctx2d.clearRect(0, 0, w, h);
  ctx2d.fillStyle = "rgba(7, 9, 13, 0.72)";
  ctx2d.fillRect(0, 0, w, h);

  ctx2d.strokeStyle = "rgba(207, 220, 235, 0.08)";
  ctx2d.lineWidth = 1;
  for (let y = 1; y < 4; y += 1) {
    const yy = (h / 4) * y;
    ctx2d.beginPath();
    ctx2d.moveTo(0, yy);
    ctx2d.lineTo(w, yy);
    ctx2d.stroke();
  }

  const amps = [];
  for (let n = 1; n <= harmonics; n += 1) {
    let amp = 0;
    let count = 0;
    if (ctrl.triangle) {
      amp += n % 2 ? 1 / (n * n) : 0;
      count += 1;
    }
    if (ctrl.sawtooth) {
      amp += 1 / n;
      count += 1;
    }
    if (ctrl.pulse) {
      amp += Math.abs(Math.sin(Math.PI * n * duty)) / n;
      count += 1;
    }
    if (ctrl.noise) {
      amp += 0.22 + pseudo(n, control, pulseWidth) * 0.5;
      count += 1;
    }
    amps.push(count ? amp / count : 0);
  }
  const max = Math.max(0.001, ...amps);
  const slot = w / harmonics;
  ctx2d.fillStyle = gate ? color : "rgba(142, 154, 170, 0.62)";
  for (let i = 0; i < amps.length; i += 1) {
    const v = Math.pow(amps[i] / max, 0.72);
    const bh = Math.max(1, v * (h - 12));
    ctx2d.fillRect(i * slot + 1, h - bh - 2, Math.max(1, slot - 2), bh);
  }
}

function cssColor(value) {
  if (!cssColor.cache) cssColor.cache = new Map();
  if (cssColor.cache.has(value)) return cssColor.cache.get(value);
  const probe = document.createElement("span");
  probe.style.color = value || "rgba(56, 243, 163, 0.95)";
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  const resolved = color || "rgba(56, 243, 163, 0.95)";
  cssColor.cache.set(value, resolved);
  return resolved;
}

function pseudo(n, control, pulseWidth) {
  let seed = (n * 1103515245 + control * 8191 + pulseWidth * 131) & 0x7fffffff;
  seed = (seed ^ (seed >>> 13)) * 1274126177;
  return ((seed >>> 8) & 0xff) / 255;
}

function filterCard() {
  const canvas = el("canvas");
  const cutoff = metric("Cutoff");
  const resonance = metric("Resonance");
  const mode = metric("Mode");
  const route = metric("Routing");
  const volume = metric("Volume");
  const node = el("div", { class: "insight-card filter-card" }, [
    el("div", { class: "filter-card__plot" }, [canvas]),
    el("div", { class: "filter-card__metrics" }, [cutoff.node, resonance.node, mode.node, route.node, volume.node]),
  ]);
  return { node, canvas, cutoff: cutoff.value, resonance: resonance.value, mode: mode.value, route: route.value, volume: volume.value };
}

function registerHeatmap() {
  const groups = [
    { title: "Voice 1", range: [0x00, 0x06] },
    { title: "Voice 2", range: [0x07, 0x0d] },
    { title: "Voice 3", range: [0x0e, 0x14] },
    { title: "Filter / Global", range: [0x15, 0x1c] },
  ];
  const cells = [];
  const node = el("div", { class: "register-grid" });

  for (const group of groups) {
    const groupCells = [];
    for (let index = group.range[0]; index <= group.range[1]; index += 1) {
      const info = REGISTER_MAP[index];
      const value = el("strong", {}, "$00");
      const cellNode = el("div", { class: "register-cell", title: info.purpose }, [
        el("span", {}, `$${fmtHex(info.addr, 4)}`),
        value,
        el("small", {}, info.name),
      ]);
      cells.push({ node: cellNode, value, index });
      groupCells.push(cellNode);
    }
    while (groupCells.length < 8) {
      groupCells.push(el("div", { class: "register-cell register-cell--empty", "aria-hidden": "true" }, [
        el("span", {}, " "),
        el("strong", {}, "--"),
        el("small", {}, "free"),
      ]));
    }
    node.append(el("section", { class: "register-group" }, [
      el("h3", {}, group.title),
      el("div", { class: "register-group__cells" }, groupCells),
    ]));
  }

  return { node, cells };
}

function metric(label) {
  const value = el("strong", {}, "--");
  return { node: el("div", { class: "filter-metric" }, [value, el("span", {}, label)]), value };
}

function noteFromHz(hz) {
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return noteName(Math.max(0, Math.min(127, midi)));
}
