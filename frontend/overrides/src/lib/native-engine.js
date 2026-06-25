import {
  GetPlaybackState,
  LoadUploadedTune,
  LoadTrack,
  PlayUploadedTune,
  PlayTrack,
  ResetEqualizer,
  Seek,
  SetAudioControls,
  SetEqualizer,
  SetVolume,
  Stop,
  ToggleMute,
  TogglePause,
} from "../../wailsjs/go/main/App.js";

const DEFAULT_EQUALIZER = {
  enabled: true,
  bass: 0,
  mid: 0,
  treble: 0,
};

const DEFAULT_CONTROLS = {
  voiceMask: 7,
  filterBypass: false,
  filterEnabled: true,
};

export function createNativeEngineController({ events, toast }) {
  const analyser = createNativeAnalyser();
  const state = {
    ready: true,
    error: null,
    tune: null,
    playing: false,
    paused: false,
    seeking: false,
    currentSubtune: 1,
    elapsed: 0,
    duration: 0,
    volume: 0.78,
    muted: false,
    equalizer: { ...DEFAULT_EQUALIZER },
    audioControls: { ...DEFAULT_CONTROLS },
    lastSnapshot: null,
    currentTuneBytes: null,
    currentTrackId: "",
    pollTimer: 0,
    pollBusy: false,
    pauseBusy: false,
  };

  function snapshot() {
    return {
      ready: state.ready,
      error: state.error,
      capabilities: nativeCapabilities(),
      tune: state.tune,
      playing: state.playing,
      paused: state.paused,
      seeking: state.seeking,
      seekTarget: 0,
      currentSubtune: state.currentSubtune,
      elapsed: state.elapsed,
      volume: state.volume,
      muted: state.muted,
      equalizer: { ...state.equalizer },
      audioControls: { ...state.audioControls, filterEnabled: !state.audioControls.filterBypass },
    };
  }

  function emitState() {
    events.emit("engine.state", snapshot());
  }

  async function loadSDK() {
    state.ready = true;
    state.error = null;
    events.emit("engine.sdk.ready", nativeCapabilities());
    emitState();
    startPolling();
    return true;
  }

  async function ensureSDK() {
    return loadSDK();
  }

  async function loadFromUrl(_url, source = {}) {
    if (!source.trackId) throw new Error("Track-ID fehlt.");
    state.currentTrackId = source.trackId;
    state.currentTuneBytes = null;
    state.tune = tuneFromSource(source, state.currentSubtune);
    const next = await LoadTrack(source.trackId);
    applyBackendState(next, { emitSnapshot: false });
    events.emit("engine.tune.loaded", { metadata: state.tune?.metadata, source });
    emitState();
    return state.tune;
  }

  async function loadFromBytes(bytes, source = {}) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    const label = source.label || source.file || "Upload.sid";
    const next = await LoadUploadedTune(label, Array.from(data));
    state.currentTuneBytes = new Uint8Array(data);
    applyBackendState(next, { emitSnapshot: false });
    events.emit("engine.tune.loaded", { metadata: state.tune?.metadata, source: state.tune?.source || source });
    emitState();
    return state.tune;
  }

  async function play({ subtune, startAt = 0, paused = false } = {}) {
    const trackId = state.currentTrackId || state.tune?.source?.trackId;
    const isUpload = state.tune?.source?.kind === "upload";
    if (!isUpload && !trackId) throw new Error("Lade zuerst einen Track.");
    const next = isUpload
      ? await PlayUploadedTune(subtune || state.currentSubtune || 1, startAt || 0)
      : await PlayTrack(trackId, subtune || state.currentSubtune || 1, startAt || 0);
    applyBackendState(next, { emitSnapshot: true });
    if (paused && state.playing && !state.paused) {
      await pause();
    } else {
      events.emit("engine.play.started", { subtune: state.currentSubtune });
    }
    startPolling();
    emitState();
  }

  async function playLibraryTrack(track, { subtune, startAt = 0 } = {}) {
    if (!track?.id) throw new Error("Track-ID fehlt.");
    state.currentTrackId = track.id;
    state.currentTuneBytes = null;
    state.currentSubtune = Number(subtune || track.defaultSubtune || 1);
    state.tune = tuneFromTrack(track, state.currentSubtune);
    events.emit("engine.tune.loaded", { metadata: state.tune.metadata, source: state.tune.source });
    emitState();

    const next = await PlayTrack(track.id, state.currentSubtune, startAt || 0);
    applyBackendState(next, { emitSnapshot: true });
    events.emit("engine.play.started", { subtune: state.currentSubtune });
    startPolling();
    emitState();
  }

  async function pause() {
    if (state.pauseBusy || (!state.playing && !state.paused)) return;
    state.pauseBusy = true;
    const previous = {
      playing: state.playing,
      paused: state.paused,
      elapsed: state.elapsed,
    };
    const eventName = previous.paused ? "engine.play.resumed" : "engine.play.paused";
    state.paused = !previous.paused;
    state.playing = previous.paused;
    events.emit(eventName);
    emitState();
    try {
      const next = await TogglePause();
      applyBackendState(next, { emitSnapshot: false });
      emitState();
    } catch (error) {
      state.playing = previous.playing;
      state.paused = previous.paused;
      state.elapsed = previous.elapsed;
      state.error = error?.message || String(error);
      events.emit("engine.play.error", error);
      emitState();
      throw error;
    } finally {
      state.pauseBusy = false;
    }
  }

  async function stop() {
    const next = await Stop();
    applyBackendState(next, { emitSnapshot: false });
    events.emit("engine.play.stopped");
    emitState();
  }

  async function seek(seconds) {
    const target = Math.max(0, Number(seconds) || 0);
    state.seeking = true;
    emitState();
    const next = await Seek(target);
    applyBackendState(next, { emitSnapshot: true });
    events.emit("engine.seek", { elapsed: state.elapsed, subtune: state.currentSubtune });
    emitState();
  }

  async function setVolume(value) {
    const next = await SetVolume(clamp(Number(value) || 0, 0, 1));
    applyBackendState(next, { emitSnapshot: false });
    events.emit("engine.volume", { volume: state.volume, muted: state.muted });
    emitState();
  }

  async function toggleMute() {
    const next = await ToggleMute();
    applyBackendState(next, { emitSnapshot: false });
    events.emit("engine.volume", { volume: state.volume, muted: state.muted });
    emitState();
  }

  async function setEqualizer(patch = {}) {
    state.equalizer = normalizeEqualizer({ ...state.equalizer, ...patch });
    const next = await SetEqualizer(patch);
    applyBackendState(next, { emitSnapshot: false });
    events.emit("engine.equalizer", { ...state.equalizer });
    emitState();
  }

  async function resetEqualizer() {
    const next = await ResetEqualizer();
    applyBackendState(next, { emitSnapshot: false });
    events.emit("engine.equalizer", { ...state.equalizer });
    emitState();
  }

  async function setAudioControls(patch = {}) {
    state.audioControls = normalizeControls({ ...state.audioControls, ...patch });
    const next = await SetAudioControls(patch);
    applyBackendState(next, { emitSnapshot: false });
    events.emit("engine.audio.controls", { ...state.audioControls, filterEnabled: !state.audioControls.filterBypass });
    emitState();
  }

  async function resetAudioControls() {
    await setAudioControls({ voiceMask: 7, filterBypass: false });
  }

  function applyBackendState(next, { emitSnapshot = true } = {}) {
    if (!next) return;
    state.ready = next.ready !== false;
    state.error = next.error || null;
    state.playing = !!next.playing;
    state.paused = !!next.paused;
    state.seeking = !!next.seeking;
    state.currentSubtune = Number(next.currentSubtune || state.currentSubtune || 1);
    state.elapsed = Number(next.elapsed || 0);
    state.duration = Number(next.duration || 0);
    state.volume = clamp(Number(next.volume ?? state.volume), 0, 1);
    state.muted = !!next.muted;
    state.equalizer = normalizeEqualizer(next.equalizer || state.equalizer);
    state.audioControls = normalizeControls(next.audioControls || state.audioControls);
    if (next.tune) {
      state.tune = next.tune;
      state.currentTrackId = next.tune.source?.trackId || state.currentTrackId;
    }
    if (Array.isArray(next.scope)) analyser.setTimeSamples(next.scope);
    if (Array.isArray(next.spectrum)) analyser.setSpectrumSamples(next.spectrum);
    if (next.snapshot) {
      state.lastSnapshot = next.snapshot;
      if (emitSnapshot) events.emit("engine.snapshot", next.snapshot);
    }
    events.emit("engine.tick", { elapsed: state.elapsed });
  }

  function startPolling() {
    if (state.pollTimer) return;
    state.pollTimer = window.setInterval(async () => {
      if (state.pollBusy || (!state.tune && !state.playing)) return;
      state.pollBusy = true;
      try {
        const next = await GetPlaybackState();
        applyBackendState(next, { emitSnapshot: true });
        emitState();
      } catch (error) {
        state.error = error?.message || String(error);
        events.emit("engine.play.error", error);
        emitState();
      } finally {
        state.pollBusy = false;
      }
    }, 120);
  }

  return {
    state,
    snapshot,
    loadSDK,
    ensureSDK,
    loadFromUrl,
    loadFromBytes,
    play,
    playLibraryTrack,
    pause,
    stop,
    seek,
    setVolume,
    toggleMute,
    setEqualizer,
    resetEqualizer,
    setAudioControls,
    resetAudioControls,
    getAnalyser: () => ({ analyser, buffer: analyser.timeBuffer }),
    getMasterGain: () => null,
    getAudioContext: () => null,
    createStepStream: async () => {
      throw new Error("Instruction-Stepping ist im Native-Bridge-Modus noch nicht aktiv.");
    },
    isPlaying: () => state.playing && !state.paused,
    isPaused: () => state.paused,
    getMetadata: () => state.tune?.metadata || null,
    getSubtune: () => state.currentSubtune,
    getElapsed: () => state.elapsed,
    getVolume: () => state.volume,
    isMuted: () => state.muted,
    getEqualizer: () => ({ ...state.equalizer }),
    getAudioControls: () => ({ ...state.audioControls, filterEnabled: !state.audioControls.filterBypass }),
    getCapabilities: nativeCapabilities,
    getCurrentTune: () => state.tune,
    getCurrentTuneBytes: () => state.currentTuneBytes,
    getLastSnapshot: () => state.lastSnapshot,
    getError: () => state.error,
    setSubtune: (n) => {
      state.currentSubtune = Math.max(1, Math.trunc(Number(n) || 1));
    },
  };
}

function tuneFromSource(source, subtune) {
  return {
    metadata: {
      title: source.label || "Unbenannt",
      author: "",
      subtuneCount: 1,
      defaultSubtune: Math.max(1, Number(subtune) || 1),
      clock: "",
      sidModel: "",
    },
    supported: true,
    source,
  };
}

function tuneFromTrack(track, subtune) {
  const total = Math.max(1, Number(track.subtunes || 1));
  const selected = Math.max(1, Math.min(total, Math.trunc(Number(subtune || track.defaultSubtune || 1))));
  return {
    metadata: {
      title: track.title || "Unbenannt",
      author: track.author || track.artist || "",
      subtuneCount: total,
      defaultSubtune: Math.max(1, Number(track.defaultSubtune || 1)),
      clock: track.clock || "",
      sidModel: track.model || "",
    },
    supported: true,
    source: {
      kind: "hvsc",
      file: track.file,
      label: track.title || "Unbenannt",
      trackId: track.id,
      releaseId: track.releaseId,
      artistId: track.artistId,
      duration: durationForSubtune(track, selected),
    },
  };
}

function durationForSubtune(track, subtune) {
  if (Array.isArray(track?.durations) && subtune > 0 && subtune <= track.durations.length) {
    return Number(track.durations[subtune - 1] || 0);
  }
  return Number(track?.duration || 0);
}

function nativeCapabilities() {
  return {
    runtime: "go-native",
    features: {
      snapshot: true,
      trace: false,
      nativeAudio: true,
    },
  };
}

function normalizeEqualizer(value = {}) {
  return {
    enabled: value.enabled !== false,
    bass: clampDb(value.bass),
    mid: clampDb(value.mid),
    treble: clampDb(value.treble),
  };
}

function normalizeControls(value = {}) {
  const filterBypass = Object.prototype.hasOwnProperty.call(value, "filterBypass")
    ? !!value.filterBypass
    : !value.filterEnabled;
  return {
    voiceMask: clamp(Number(value.voiceMask ?? 7) | 0, 0, 7),
    filterBypass,
    filterEnabled: !filterBypass,
  };
}

function clampDb(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return clamp(Math.round(n), -12, 12);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createNativeAnalyser() {
  const analyser = {
    fftSize: 1024,
    frequencyBinCount: 512,
    timeBuffer: new Uint8Array(1024),
    freqBuffer: new Uint8Array(512),
    getByteTimeDomainData(out) {
      copyLoop(this.timeBuffer, out);
    },
    getByteFrequencyData(out) {
      copyLoop(this.freqBuffer, out);
    },
    setTimeSamples(samples) {
      if (!samples.length) return;
      for (let i = 0; i < this.timeBuffer.length; i += 1) {
        const sample = Number(samples[Math.floor(i * samples.length / this.timeBuffer.length)] || 0);
        this.timeBuffer[i] = clamp(Math.round(sample / 256 + 128), 0, 255);
      }
    },
    setSpectrumSamples(samples) {
      if (!samples.length) return;
      const bins = this.freqBuffer.length;
      const windowSize = Math.max(8, Math.floor(samples.length / bins));
      for (let i = 0; i < bins; i += 1) {
        const start = Math.floor(i * samples.length / bins);
        let sum = 0;
        let peak = 0;
        for (let j = 0; j < windowSize && start + j < samples.length; j += 1) {
          const v = Math.abs(Number(samples[start + j]) || 0) / 32768;
          sum += v * v;
          if (v > peak) peak = v;
        }
        const rms = Math.sqrt(sum / windowSize);
        const shaped = Math.pow(Math.max(rms, peak * 0.45), 0.55);
        this.freqBuffer[i] = clamp(Math.round(shaped * 255), 0, 255);
      }
    },
  };
  analyser.timeBuffer.fill(128);
  return analyser;
}

function copyLoop(from, to) {
  if (!to) return;
  for (let i = 0; i < to.length; i += 1) {
    to[i] = from[i % from.length];
  }
}
