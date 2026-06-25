import { el, svg, fmtTime, clamp } from "../lib/ui.js";
import { currentTrack, formatDuration, playNextTrack, playPrevTrack } from "../lib/catalog.js?v=dev";

export function mountPlayer(host, ctx) {
  let autoAdvanceKey = "";
  let transportBusy = false;
  let pendingSubtune = 0;

  const wrap = el("section", { class: "shell-player", "aria-label": "SID Player" });
  const artCanvas = el("canvas", { width: 120, height: 120 });
  const art = el("button", {
    class: "player-art",
    title: "Open Insight",
    onclick: () => ctx.router?.navigate("insight"),
  }, [artCanvas, el("span", { class: "player-art__chip" }, "SID")]);
  const titleEl = el("strong", { class: "player-meta__title" }, "No SID loaded");
  const subEl = el("span", { class: "player-meta__sub" }, "Choose a track from the library");
  const favBtn = button("heart", "Favorite", () => toggleFavorite(), "player-btn--soft");
  const subSelect = el("select", {
    class: "field player-subtune",
    "aria-label": "Subtune",
    onchange: async (event) => {
      const selected = normalizeSelectedSubtune(event.currentTarget.value);
      if (!selected) return;
      pendingSubtune = selected;
      subSelect.disabled = true;
      subSelect.dataset.busy = "true";
      ctx.engine.setSubtune(selected);
      try {
        if (ctx.engine.isPlaying() || ctx.engine.isPaused()) {
          await ctx.engine.stop();
          ctx.engine.setSubtune(selected);
          await ctx.engine.play({ subtune: selected });
        } else {
          refresh();
        }
      } catch (error) {
        ctx.toast.error(`Could not start subtune: ${error.message || error}`);
      } finally {
        pendingSubtune = 0;
        subSelect.disabled = false;
        delete subSelect.dataset.busy;
        refresh();
      }
    },
  });
  const subSelectWrap = el("span", {
    class: "player-subtune-wrap",
    hidden: true,
    title: "Subtune",
  }, [subSelect]);
  const left = el("div", { class: "player-info" }, [art, el("div", { class: "player-meta" }, [titleEl, subEl]), favBtn, subSelectWrap]);

  const prevBtn = button("prev", "Previous track", () => safePrev());
  const playBtn = button("play", "Play / pause", () => togglePlay(), "player-btn--primary");
  const nextBtn = button("next", "Next track", () => safeNext());
  const elapsedEl = el("span", {}, "0:00");
  const totalEl = el("span", {}, "--:--");
  const barFill = el("span");
  const progressBar = el("button", {
    class: "player-progress__bar",
    title: "Seek to this position",
    "aria-label": "Seek to this position",
    onclick: (event) => seekFromProgress(event),
  }, [barFill]);
  const progress = el("div", { class: "player-progress" }, [
    elapsedEl,
    progressBar,
    totalEl,
  ]);
  const center = el("div", { class: "player-controls" }, [
    el("div", { class: "player-buttons" }, [prevBtn, playBtn, nextBtn]),
    progress,
  ]);

  const scopeCanvas = el("canvas", { width: 260, height: 88 });
  const scope = el("button", {
    class: "player-scope",
    title: "Open live Insight",
    onclick: () => ctx.router?.navigate("insight"),
  }, [scopeCanvas]);
  const volSlider = el("input", {
    type: "range",
    min: "0",
    max: "1",
    step: "0.01",
    value: String(ctx.engine.getVolume()),
    oninput: (event) => {
      ctx.engine.setVolume(Number(event.target.value));
      updateVolumeLabel(ctx.engine.snapshot());
    },
  });
  const muteBtn = button("volume", "Mute", () => ctx.engine.toggleMute());
  const volValue = el("span", { class: "player-vol__value" }, "78%");
  const eqBtn = button("eq", "Equalizer", () => toggleEqPanel(), "player-btn--soft");
  const eqPanel = buildEqualizerPanel();
  const eqWrap = el("div", { class: "player-eq" }, [eqBtn, eqPanel]);
  const right = el("div", { class: "player-extras" }, [
    scope,
    eqWrap,
    el("div", { class: "player-vol" }, [muteBtn, volSlider, volValue]),
  ]);

  wrap.append(left, center, right);
  host.append(wrap);

  function button(icon, label, onclick, extraClass = "") {
    const btn = el("button", {
      class: `player-btn ${extraClass}`,
      title: label,
      "aria-label": label,
      onclick,
    });
    btn.append(svg(icon, 18));
    return btn;
  }

  function setIcon(btn, name) {
    btn.innerHTML = "";
    btn.append(svg(name, name === "play" || name === "pause" ? 16 : 18));
  }

  async function togglePlay() {
    if (transportBusy) return;
    if (!ctx.engine.getCurrentTune()) {
      ctx.toast.warn("No track loaded.");
      return;
    }
    transportBusy = true;
    playBtn.disabled = true;
    playBtn.dataset.busy = "true";
    try {
      if (ctx.engine.isPlaying() || ctx.engine.isPaused()) {
        await ctx.engine.pause();
      } else {
        await ctx.engine.play({ subtune: ctx.engine.getSubtune() });
      }
    } catch (error) {
      const action = ctx.engine.isPlaying() || ctx.engine.isPaused() ? "toggle" : "start";
      ctx.toast.error(`Could not ${action} playback: ${error.message || error}`);
    } finally {
      transportBusy = false;
      playBtn.disabled = false;
      delete playBtn.dataset.busy;
      refresh();
    }
  }

  async function safeNext() {
    try {
      const ok = await playNextTrack(ctx);
      if (!ok) ctx.toast.warn("No active queue.");
    } catch (error) {
      ctx.toast.error(`Next track failed: ${error.message || error}`);
    }
  }

  async function safePrev() {
    try {
      const ok = await playPrevTrack(ctx);
      if (!ok) ctx.toast.warn("No active queue.");
    } catch (error) {
      ctx.toast.error(`Previous track failed: ${error.message || error}`);
    }
  }

  function toggleFavorite() {
    const track = currentTrack(ctx);
    if (!track) return;
    const active = ctx.favorites.toggle(track.id);
    favBtn.dataset.active = active ? "true" : "false";
  }

  function toggleEqPanel() {
    eqPanel.hidden = !eqPanel.hidden;
  }

  function buildEqualizerPanel() {
    const enabled = el("input", {
      type: "checkbox",
      onchange: () => ctx.engine.setEqualizer({ enabled: enabled.checked }),
    });
    const sliders = {
      bass: eqSlider("Bass", "bass"),
      mid: eqSlider("Mids", "mid"),
      treble: eqSlider("Treble", "treble"),
    };
    const presets = [
      ["Flat", { enabled: true, bass: 0, mid: 0, treble: 0 }],
      ["Warm", { enabled: true, bass: 3, mid: 1, treble: -2 }],
      ["Clear", { enabled: true, bass: -1, mid: 0, treble: 3 }],
      ["Bass", { enabled: true, bass: 5, mid: 0, treble: -1 }],
    ];
    const node = el("div", { class: "player-eq-panel", hidden: true }, [
      el("div", { class: "player-eq-panel__head" }, [
        el("strong", {}, "Equalizer"),
        el("label", { class: "player-eq-panel__toggle" }, [enabled, el("span", {}, "On")]),
      ]),
      sliders.bass.node,
      sliders.mid.node,
      sliders.treble.node,
      el("div", { class: "player-eq-panel__presets" }, presets.map(([label, preset]) => (
        el("button", { onclick: () => ctx.engine.setEqualizer(preset) }, label)
      ))),
      el("button", { class: "player-eq-panel__reset", onclick: () => ctx.engine.resetEqualizer() }, "Reset"),
    ]);

    function paint() {
      const eq = ctx.engine.getEqualizer();
      enabled.checked = eq.enabled;
      for (const [key, slider] of Object.entries(sliders)) {
        slider.input.value = String(eq[key]);
        slider.value.textContent = dbLabel(eq[key]);
      }
      eqBtn.dataset.active = eq.enabled && (eq.bass !== 0 || eq.mid !== 0 || eq.treble !== 0) ? "true" : "false";
    }

    ctx.events.on("engine.equalizer", paint);
    document.addEventListener("click", (event) => {
      if (eqPanel.hidden || eqWrap.contains(event.target)) return;
      eqPanel.hidden = true;
    });
    paint();
    return node;
  }

  function eqSlider(label, key) {
    const value = el("span", { class: "player-eq-panel__value" }, "0 dB");
    const input = el("input", {
      type: "range",
      min: "-12",
      max: "12",
      step: "1",
      value: "0",
      oninput: (event) => {
        const next = Number(event.currentTarget.value);
        value.textContent = dbLabel(next);
        ctx.engine.setEqualizer({ [key]: next });
      },
    });
    const node = el("label", { class: "player-eq-slider" }, [
      el("span", {}, label),
      input,
      value,
    ]);
    return { node, input, value };
  }

  function dbLabel(value) {
    const n = Math.round(Number(value) || 0);
    if (n > 0) return `+${n} dB`;
    return `${n} dB`;
  }

  async function seekFromProgress(event) {
    const track = currentTrack(ctx);
    const snap = ctx.engine.snapshot();
    const duration = currentDuration(snap, track);
    if (!duration) {
      ctx.toast.warn("No length is known for this track.");
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    try {
      await ctx.engine.seek(duration * ratio);
    } catch (error) {
      ctx.toast.error(`Seek failed: ${error.message || error}`);
    }
  }

  function currentDuration(snap, track) {
    if (!track) return 0;
    const subtune = Math.max(0, Number(snap.currentSubtune || track.defaultSubtune || 1) - 1);
    return track.durations?.[subtune] || track.duration || 0;
  }

  function normalizeSelectedSubtune(value) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function refresh() {
    const snap = ctx.engine.snapshot();
    const tune = snap.tune;
    const track = currentTrack(ctx);
    const duration = currentDuration(snap, track);
    if (track) {
      titleEl.textContent = track.title;
      subEl.textContent = `${track.artist} - ${track.author || track.artistType}`;
      totalEl.textContent = formatDuration(duration);
      favBtn.dataset.active = ctx.favorites.has(track.id) ? "true" : "false";
    } else if (tune) {
      titleEl.textContent = tune.metadata.title || tune.source?.label || "Untitled";
      subEl.textContent = tune.metadata.author || "Unknown";
      totalEl.textContent = "--:--";
      favBtn.dataset.active = "false";
    } else {
      titleEl.textContent = "No SID loaded";
      subEl.textContent = "Choose a track from the library";
      totalEl.textContent = "--:--";
      favBtn.dataset.active = "false";
    }

    const total = tune?.metadata?.subtuneCount || track?.subtunes || 1;
    if (total > 1) {
      subSelectWrap.hidden = false;
      if (subSelect.options.length !== total) {
        subSelect.innerHTML = "";
        for (let i = 1; i <= total; i += 1) subSelect.append(new Option(`${i}/${total}`, String(i)));
      }
      subSelect.value = String(pendingSubtune || snap.currentSubtune || track?.defaultSubtune || 1);
    } else {
      subSelectWrap.hidden = true;
      pendingSubtune = 0;
    }

    setIcon(playBtn, snap.playing && !snap.paused ? "pause" : "play");
    elapsedEl.textContent = fmtTime(snap.elapsed);
    const ratio = duration ? clamp(snap.elapsed / duration, 0, 1) : clamp((snap.elapsed % 60) / 60, 0, 1);
    barFill.style.width = snap.playing || snap.paused ? `${ratio * 100}%` : "0%";
    progressBar.disabled = !duration;
    updateVolumeLabel(snap);
    maybeAutoAdvance(snap, track, duration);
  }

  function maybeAutoAdvance(snap, track, duration) {
    if (!track || !duration || !snap.playing || snap.paused || snap.seeking) return;
    const key = `${track.id}:${snap.currentSubtune || 1}`;
    if (snap.elapsed < duration - 0.5) {
      if (autoAdvanceKey === key) autoAdvanceKey = "";
      return;
    }
    if (snap.elapsed < duration - 0.05) return;

    if (autoAdvanceKey === key) return;
    autoAdvanceKey = key;

    playNextTrack(ctx, { wrap: false }).then((ok) => {
      if (!ok) return ctx.engine.stop();
      return null;
    }).catch((error) => {
      ctx.toast.error(`Next track failed: ${error.message || error}`);
    });
  }

  function updateVolumeLabel(snap) {
    const pct = Math.round((snap.volume || 0) * 100);
    volValue.textContent = snap.muted ? "Muted" : `${pct}%`;
    volSlider.value = String(snap.volume || 0);
  }

  for (const ev of [
    "engine.state",
    "engine.tick",
    "engine.tune.loaded",
    "engine.play.started",
    "engine.play.stopped",
    "engine.play.paused",
    "engine.play.resumed",
    "engine.seek",
    "engine.volume",
    "favorites.changed",
  ]) ctx.events.on(ev, refresh);

  const scopeCtx = scopeCanvas.getContext("2d");
  function drawScope() {
    requestAnimationFrame(drawScope);
    if (!scopeCanvas.isConnected) return;
    const { analyser, buffer } = ctx.engine.getAnalyser();
    const w = scopeCanvas.width;
    const h = scopeCanvas.height;
    scopeCtx.clearRect(0, 0, w, h);
    scopeCtx.fillStyle = "rgba(10,12,16,0.85)";
    scopeCtx.fillRect(0, 0, w, h);
    if (!analyser) return;
    analyser.getByteTimeDomainData(buffer);
    scopeCtx.strokeStyle = "rgba(56,243,163,0.9)";
    scopeCtx.lineWidth = 1.4;
    scopeCtx.beginPath();
    const stride = Math.max(1, Math.floor(buffer.length / w));
    for (let x = 0; x < w; x += 1) {
      const v = buffer[x * stride] / 128 - 1;
      const y = (1 + v) * 0.5 * h;
      if (x === 0) scopeCtx.moveTo(x, y);
      else scopeCtx.lineTo(x, y);
    }
    scopeCtx.stroke();
  }
  requestAnimationFrame(drawScope);

  const artCtx = artCanvas.getContext("2d");
  function drawArt() {
    requestAnimationFrame(drawArt);
    if (!artCanvas.isConnected) return;
    const { analyser } = ctx.engine.getAnalyser();
    if (!analyser) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);
    artCtx.fillStyle = "rgba(10,12,16,0.22)";
    artCtx.fillRect(0, 0, artCanvas.width, artCanvas.height);
    const bars = 20;
    const step = Math.max(1, Math.floor(buf.length / bars));
    for (let i = 0; i < bars; i += 1) {
      const v = buf[i * step] / 255;
      const bw = artCanvas.width / bars - 2;
      const bh = Math.max(2, v * (artCanvas.height - 8));
      artCtx.fillStyle = `hsl(${130 + v * 120}, 80%, ${32 + v * 34}%)`;
      artCtx.fillRect(i * (bw + 2) + 2, artCanvas.height - bh - 2, bw, bh);
    }
  }
  requestAnimationFrame(drawArt);

  refresh();
  return { refresh, togglePlay };
}
