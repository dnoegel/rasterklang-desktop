// Engine controller wraps the WASM SDK and provides:
//   - Loading SID files (URL or bytes)
//   - A single global player (audio playback) with snapshot polling
//   - Tap-in points for "step" mode (Note Lab) and live trace (Insight)
//   - Events broadcast over the shared event bus
//
// All higher-level UI uses this controller; nothing imports the SDK directly.
import { loadSdk } from "./sdk.js?v=2026-05-01-084125";

const SEEK_SPEED = 60;
const SEEK_SLICE_SECONDS = 0.5;
const EQ_STORAGE_KEY = "zmk-webplayer:eq";
const DEFAULT_EQUALIZER = {
  enabled: true,
  bass: 0,
  mid: 0,
  treble: 0,
};

export function createEngineController({ events, toast }) {
  const state = {
    sdk: null,
    sdkError: null,
    sdkPromise: null,
    capabilities: null,

    tune: null,           // ZmkSidTune
    tuneBytes: null,      // raw Uint8Array
    tuneSource: null,     // { kind: "library"|"upload", file, label }
    metadata: null,

    audioContext: null,
    eqInput: null,
    eqLow: null,
    eqMid: null,
    eqHigh: null,
    masterGain: null,
    analyser: null,
    analyserBuf: null,
    scheduledSources: new Set(),

    debugStream: null,    // active debug stream during playback
    snapshotTimer: 0,
    snapshotInterval: 60,
    lastSnapshot: null,
    lastTraceSeq: 0,
    traceMaskActive: 0,

    playing: false,
    paused: false,
    seeking: false,
    seekTarget: 0,
    seekMuteActive: false,
    seekToken: 0,
    currentSubtune: 1,
    duration: 180,        // unknown for SID -> show wall clock instead
    elapsed: 0,
    elapsedTimer: 0,

    // Volume in 0..1 range.
    volume: 0.78,
    muted: false,
    equalizer: loadStoredEqualizer(),

    audioControls: {
      voiceMask: 0x07,
      filterBypass: false,
    },
  };

  function getAudio() {
    if (state.audioContext) return state.audioContext;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("Dieser Browser bietet kein Web Audio.");
    state.audioContext = new Ctx();
    state.eqInput = state.audioContext.createGain();
    state.eqLow = state.audioContext.createBiquadFilter();
    state.eqMid = state.audioContext.createBiquadFilter();
    state.eqHigh = state.audioContext.createBiquadFilter();
    configureEqualizerNodes();
    state.masterGain = state.audioContext.createGain();
    syncMasterGain();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 1024;
    state.analyserBuf = new Uint8Array(state.analyser.fftSize);
    state.eqInput.connect(state.eqLow);
    state.eqLow.connect(state.eqMid);
    state.eqMid.connect(state.eqHigh);
    state.eqHigh.connect(state.masterGain);
    state.masterGain.connect(state.analyser);
    state.analyser.connect(state.audioContext.destination);
    applyEqualizerToNodes();
    return state.audioContext;
  }

  function emitState() {
    events.emit("engine.state", snapshot());
  }

  function snapshot() {
    return {
      ready: !!state.sdk?.ok,
      error: state.sdkError,
      capabilities: state.capabilities,
      tune: state.tune ? {
        metadata: state.metadata,
        supported: state.tune.supported,
        supportError: state.tune.supportError,
        source: state.tuneSource,
      } : null,
      playing: state.playing,
      paused: state.paused,
      seeking: state.seeking,
      seekTarget: state.seekTarget,
      currentSubtune: state.currentSubtune,
      elapsed: state.elapsed,
      volume: state.volume,
      muted: state.muted,
      equalizer: { ...state.equalizer },
      audioControls: { ...state.audioControls, filterEnabled: !state.audioControls.filterBypass },
    };
  }

  // ---- SDK wiring ----

  async function loadSDK() {
    if (state.sdkPromise) return state.sdkPromise;
    state.sdkPromise = (async () => {
      const sdk = await loadSdk();
      state.sdk = sdk;
      if (!sdk.ok) {
        state.sdkError = sdk.error?.message || "WASM nicht verfuegbar.";
        events.emit("engine.sdk.error", state.sdkError);
        emitState();
        return null;
      }
      try {
        state.capabilities = sdk.sid.capabilities();
      } catch {
        state.capabilities = null;
      }
      state.sdkError = null;
      events.emit("engine.sdk.ready", state.capabilities);
      emitState();
      return sdk.sid;
    })();
    return state.sdkPromise;
  }

  async function ensureSDK() {
    if (!state.sdkPromise) await loadSDK();
    else await state.sdkPromise;
    if (!state.sdk?.ok) throw new Error(state.sdkError || "WASM nicht geladen.");
    return state.sdk.sid;
  }

  // ---- Tune loading ----

  async function loadFromUrl(url, source) {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Konnte ${url} nicht laden (${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return loadFromBytes(bytes, source);
  }

  async function loadFromBytes(bytes, source) {
    if (state.playing) await stop();
    const sid = await ensureSDK();
    const tune = sid.loadBytes(bytes);
    state.tune = tune;
    state.tuneBytes = bytes;
    state.tuneSource = source || null;
    state.metadata = tune.metadata;
    state.currentSubtune = normalizeSubtune(tune.metadata.defaultSubtune || 1, tune.metadata);
    state.elapsed = 0;
    state.lastSnapshot = null;
    state.lastTraceSeq = 0;
    state.audioControls = { voiceMask: 0x07, filterBypass: false };
    events.emit("engine.tune.loaded", { metadata: state.metadata, source });
    emitState();
    return tune;
  }

  // ---- Playback ----

  function tickElapsed() {
    if (!state.playing || state.paused || state.seeking) return;
    state.elapsed += 0.1;
    events.emit("engine.tick", { elapsed: state.elapsed });
  }

  async function play({ subtune, traceMask, startAt = 0, paused = false } = {}) {
    if (!state.tune) throw new Error("Lade zuerst eine SID Datei.");
    const audio = getAudio();
    await audio.resume();
    const runToken = ++state.seekToken;

    if (subtune == null) subtune = state.currentSubtune;
    subtune = normalizeSubtune(subtune, state.metadata);
    state.currentSubtune = subtune;

    // Stop any prior debug stream.
    if (state.debugStream) {
      try { state.debugStream.stop(); } catch {}
      state.debugStream = null;
    }

    const caps = state.capabilities;
    const useDebug = caps?.features?.trace || caps?.features?.snapshot;
    // Insight uses snapshots, not trace events. Keeping trace off here avoids
    // making playback and accelerated seeking pay for CPU/SID event recording.
    const defaultMask = 0;
    state.traceMaskActive = traceMask ?? defaultMask;

    let stream;
    if (useDebug) {
      stream = state.tune.createDebugStream({
        subtune,
        sampleRate: Math.round(audio.sampleRate),
        traceMask: traceMaskFromBits(state.traceMaskActive),
        maxTraceEvents: 16384,
      });
      state.debugStream = stream;
    } else {
      // Fallback: plain stream.
      stream = state.tune.createStream({ subtune, sampleRate: Math.round(audio.sampleRate) });
      state.debugStream = stream;
    }
    applyAudioControlsToStream(stream);

    const offset = Math.max(0, Number(startAt) || 0);
    state.playing = true;
    state.paused = offset > 0 ? false : !!paused;
    state.seeking = offset > 0;
    state.seekTarget = offset;
    state.elapsed = 0;
    applySeekMute(state.seeking);
    events.emit("engine.play.started", { subtune });
    emitState();

    if (offset > 0) {
      try {
        await acceleratedSeekStream(stream, Math.round(audio.sampleRate), offset, runToken);
      } catch (error) {
        state.seeking = false;
        state.playing = false;
        applySeekMute(false);
        toast.error(`Springen fehlgeschlagen: ${error.message || error}`);
        events.emit("engine.play.error", error);
        emitState();
        return;
      }
      if (runToken !== state.seekToken || !state.playing) return;
      state.seeking = false;
      state.seekTarget = 0;
      state.paused = !!paused;
      state.elapsed = offset;
      applySeekMute(false);
      events.emit("engine.seek.done", { elapsed: offset, subtune });
      emitState();
    }

    attachStreamToAudio(stream, audio);
    if (useDebug) {
      startSnapshotPump(stream);
      startTracePump(stream);
    }
    if (state.elapsedTimer) clearInterval(state.elapsedTimer);
    state.elapsedTimer = setInterval(tickElapsed, 100);
    emitState();
  }

  // Drives the audio scheduling loop manually so we keep tight control over
  // the "currently scheduled" time and can update analyser/scope.
  function attachStreamToAudio(stream, audio) {
    const sampleRate = stream.sampleRate;
    const chunkFrames = 4096;
    let scheduledTime = audio.currentTime + 0.06;
    let stopped = false;
    state._streamStopped = () => stopped = true;

    function pump() {
      if (stopped || !state.playing) return;
      try {
        while (scheduledTime < audio.currentTime + 0.6 && !state.paused) {
          const samples = stream.readChunk(chunkFrames);
          if (!samples.length) break;
          const buf = audio.createBuffer(1, samples.length, sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < samples.length; i += 1) data[i] = Math.max(-1, samples[i] / 32768);
          const src = audio.createBufferSource();
          src.buffer = buf;
          src.connect(state.eqInput || state.masterGain);
          src.onended = () => state.scheduledSources.delete(src);
          const startAt = Math.max(scheduledTime, audio.currentTime + 0.01);
          src.start(startAt);
          state.scheduledSources.add(src);
          scheduledTime = startAt + buf.duration;
        }
      } catch (error) {
        toast.error(`Wiedergabefehler: ${error.message || error}`);
        events.emit("engine.play.error", error);
        stopped = true;
        state.playing = false;
        emitState();
      }
      if (!stopped) setTimeout(pump, 75);
    }
    pump();
  }

  function startSnapshotPump(stream) {
    if (typeof stream.snapshot !== "function") return;
    let dropped = 0;
    if (state.snapshotTimer) clearInterval(state.snapshotTimer);
    state.snapshotTimer = setInterval(() => {
      if (!state.playing || state.paused) return;
      try {
        const snap = stream.snapshot();
        state.lastSnapshot = snap;
        events.emit("engine.snapshot", snap);
      } catch (error) {
        if (++dropped > 5) {
          clearInterval(state.snapshotTimer);
          state.snapshotTimer = 0;
          console.warn("[engine] snapshot pump aborted", error);
        }
      }
    }, state.snapshotInterval);
  }

  function startTracePump(stream) {
    if (typeof stream.readTrace !== "function") return;
    state.lastTraceSeq = 0;
    if (state.traceTimer) clearInterval(state.traceTimer);
    state.traceTimer = setInterval(() => {
      if (!state.playing || state.paused) return;
      try {
        const result = stream.readTrace({ limit: 1024, afterSeq: state.lastTraceSeq });
        if (result.events && result.events.length) {
          state.lastTraceSeq = result.nextSeq;
          events.emit("engine.trace", result);
        }
      } catch (error) {
        clearInterval(state.traceTimer);
        state.traceTimer = 0;
        console.warn("[engine] trace pump aborted", error);
      }
    }, 80);
  }

  function pause() {
    if (!state.playing) return;
    state.paused = !state.paused;
    if (!state.paused && state.audioContext) state.audioContext.resume();
    events.emit(state.paused ? "engine.play.paused" : "engine.play.resumed");
    emitState();
  }

  async function stop() {
    state.seekToken += 1;
    suspendAudioPumps();
    if (state.debugStream) {
      try { state.debugStream.stop(); } catch {}
      state.debugStream = null;
    }
    state.playing = false;
    state.paused = false;
    state.seeking = false;
    state.seekTarget = 0;
    applySeekMute(false);
    events.emit("engine.play.stopped");
    emitState();
  }

  async function seek(seconds) {
    if (!state.tune) throw new Error("Lade zuerst eine SID Datei.");
    const target = Math.max(0, Number(seconds) || 0);
    const subtune = state.currentSubtune || state.metadata?.defaultSubtune || 1;
    const shouldStayPaused = !state.playing || state.paused;
    const current = Math.max(0, Number(state.elapsed) || 0);

    if (state.debugStream && state.playing && target >= current) {
      await seekForwardOnCurrentStream(target, subtune, shouldStayPaused);
      events.emit("engine.seek", { elapsed: target, subtune });
      return;
    }

    await stop();
    await play({ subtune, traceMask: state.traceMaskActive, startAt: target, paused: shouldStayPaused });
    events.emit("engine.seek", { elapsed: target, subtune });
  }

  async function seekForwardOnCurrentStream(target, subtune, pausedAfter) {
    const stream = state.debugStream;
    const sampleRate = Math.round(stream.sampleRate || state.audioContext?.sampleRate || 44100);
    const from = Math.max(0, Number(state.elapsed) || 0);
    const distance = Math.max(0, target - from);
    const runToken = ++state.seekToken;

    suspendAudioPumps();
    state.playing = true;
    state.paused = false;
    state.seeking = distance > 0;
    state.seekTarget = target;
    applySeekMute(state.seeking);
    emitState();

    if (distance > 0) {
      try {
        await acceleratedSeekStream(stream, sampleRate, distance, runToken, from);
      } catch (error) {
        state.seeking = false;
        state.playing = false;
        applySeekMute(false);
        toast.error(`Springen fehlgeschlagen: ${error.message || error}`);
        events.emit("engine.play.error", error);
        emitState();
        return;
      }
      if (runToken !== state.seekToken || !state.playing) return;
    }

    state.seeking = false;
    state.seekTarget = 0;
    state.paused = !!pausedAfter;
    state.elapsed = target;
    applySeekMute(false);
    attachStreamToAudio(stream, getAudio());
    if (typeof stream.snapshot === "function") {
      startSnapshotPump(stream);
      startTracePump(stream);
    }
    if (state.elapsedTimer) clearInterval(state.elapsedTimer);
    state.elapsedTimer = setInterval(tickElapsed, 100);
    events.emit("engine.seek.done", { elapsed: target, subtune });
    emitState();
  }

  function suspendAudioPumps() {
    if (state._streamStopped) {
      state._streamStopped();
      state._streamStopped = null;
    }
    stopScheduledSources();
    if (state.snapshotTimer) { clearInterval(state.snapshotTimer); state.snapshotTimer = 0; }
    if (state.traceTimer) { clearInterval(state.traceTimer); state.traceTimer = 0; }
    if (state.elapsedTimer) { clearInterval(state.elapsedTimer); state.elapsedTimer = 0; }
  }

  function stopScheduledSources() {
    for (const source of state.scheduledSources) {
      try { source.stop(); } catch {}
    }
    state.scheduledSources.clear();
  }

  async function acceleratedSeekStream(stream, sampleRate, seconds, token, baseElapsed = 0) {
    const totalFrames = Math.max(0, Math.floor(seconds * sampleRate));
    let remaining = totalFrames;
    const maxChunk = Number(state.capabilities?.limits?.maxChunkFrames || 65536);
    const chunkFrames = Math.max(4096, Math.min(maxChunk, Math.round(sampleRate * SEEK_SLICE_SECONDS)));
    const startedAt = performance.now();
    let advanced = 0;

    while (remaining > 0) {
      if (token !== state.seekToken || !state.playing) return;
      const frames = Math.min(chunkFrames, remaining);
      const samples = stream.readChunk(frames);
      const read = samples?.length || 0;
      if (read <= 0) break;
      remaining -= read;
      advanced += read;

      state.elapsed = baseElapsed + Math.min(seconds, advanced / sampleRate);
      events.emit("engine.tick", { elapsed: state.elapsed });
      events.emit("engine.seek.progress", {
        elapsed: state.elapsed,
        target: baseElapsed + seconds,
        speed: SEEK_SPEED,
      });

      const expectedMs = (advanced / sampleRate / SEEK_SPEED) * 1000;
      const waitMs = expectedMs - (performance.now() - startedAt);
      if (waitMs > 1) {
        await sleep(Math.min(waitMs, 24));
      } else {
        await sleep(0);
      }
    }
  }

  function setVolume(value) {
    state.volume = Math.max(0, Math.min(1, value));
    syncMasterGain();
    events.emit("engine.volume", { volume: state.volume, muted: state.muted });
  }

  function toggleMute() {
    state.muted = !state.muted;
    syncMasterGain();
    events.emit("engine.volume", { volume: state.volume, muted: state.muted });
  }

  function setEqualizer(patch = {}) {
    state.equalizer = normalizeEqualizer({ ...state.equalizer, ...patch });
    applyEqualizerToNodes();
    saveStoredEqualizer(state.equalizer);
    events.emit("engine.equalizer", { ...state.equalizer });
    emitState();
  }

  function resetEqualizer() {
    setEqualizer(DEFAULT_EQUALIZER);
  }

  function applySeekMute(active) {
    state.seekMuteActive = !!active;
    syncMasterGain();
  }

  function syncMasterGain() {
    if (!state.masterGain) return;
    state.masterGain.gain.value = state.muted || state.seekMuteActive ? 0 : state.volume;
  }

  function configureEqualizerNodes() {
    state.eqLow.type = "lowshelf";
    state.eqLow.frequency.value = 180;
    state.eqMid.type = "peaking";
    state.eqMid.frequency.value = 1000;
    state.eqMid.Q.value = 0.85;
    state.eqHigh.type = "highshelf";
    state.eqHigh.frequency.value = 4200;
  }

  function applyEqualizerToNodes() {
    if (!state.eqLow || !state.eqMid || !state.eqHigh || !state.audioContext) return;
    const eq = state.equalizer;
    const values = eq.enabled ? eq : DEFAULT_EQUALIZER;
    const now = state.audioContext.currentTime;
    state.eqLow.gain.setTargetAtTime(values.bass, now, 0.018);
    state.eqMid.gain.setTargetAtTime(values.mid, now, 0.018);
    state.eqHigh.gain.setTargetAtTime(values.treble, now, 0.018);
  }

  function setAudioControls(patch = {}) {
    const next = { ...state.audioControls };
    if (Object.prototype.hasOwnProperty.call(patch, "voiceMask")) {
      next.voiceMask = Math.max(0, Math.min(7, Number(patch.voiceMask) | 0));
    }
    if (Object.prototype.hasOwnProperty.call(patch, "filterBypass")) {
      next.filterBypass = !!patch.filterBypass;
    } else if (Object.prototype.hasOwnProperty.call(patch, "filterEnabled")) {
      next.filterBypass = !patch.filterEnabled;
    }
    state.audioControls = next;
    applyAudioControlsToStream(state.debugStream);
    events.emit("engine.audio.controls", { ...next, filterEnabled: !next.filterBypass });
    emitState();
  }

  function resetAudioControls() {
    setAudioControls({ voiceMask: 0x07, filterBypass: false });
  }

  function applyAudioControlsToStream(stream) {
    if (!stream || typeof stream.setAudioControls !== "function") return;
    try {
      stream.setAudioControls(state.audioControls);
    } catch (error) {
      console.warn("[engine] audio controls unavailable", error);
    }
  }

  function getAnalyser() {
    return { analyser: state.analyser, buffer: state.analyserBuf };
  }

  function getMasterGain() {
    getAudio();
    return state.masterGain;
  }

  function getAudioContext() { return getAudio(); }

  // Step mode: returns a fresh DebugStream tied to the current tune that the
  // caller manages directly (Note Lab uses this).
  async function createStepStream({ subtune = 0, traceMask = 0xFF } = {}) {
    if (!state.tune) throw new Error("Lade zuerst eine SID Datei.");
    const sid = await ensureSDK();
    if (!sid.capabilities().features?.stepInstruction) {
      throw new Error("Diese WASM-Build unterstuetzt kein Instruction-Stepping.");
    }
    return state.tune.createDebugStream({
      subtune,
      sampleRate: 44100,
      traceMask: traceMaskFromBits(traceMask),
      maxTraceEvents: 16384,
    });
  }

  return {
    state,
    snapshot,
    loadSDK,
    ensureSDK,
    loadFromUrl,
    loadFromBytes,
    play,
    pause,
    stop,
    seek,
    setVolume,
    toggleMute,
    setEqualizer,
    resetEqualizer,
    setAudioControls,
    resetAudioControls,
    getAnalyser,
    getMasterGain,
    getAudioContext,
    createStepStream,
    isPlaying: () => state.playing && !state.paused,
    isPaused: () => state.paused,
    getMetadata: () => state.metadata,
    getSubtune: () => state.currentSubtune,
    getElapsed: () => state.elapsed,
    getVolume: () => state.volume,
    isMuted: () => state.muted,
    getEqualizer: () => ({ ...state.equalizer }),
    getAudioControls: () => ({ ...state.audioControls, filterEnabled: !state.audioControls.filterBypass }),
    getCapabilities: () => state.capabilities,
    getCurrentTune: () => state.tune,
    getCurrentTuneBytes: () => state.tuneBytes,
    getLastSnapshot: () => state.lastSnapshot,
    getError: () => state.sdkError,
    setSubtune: (n) => { state.currentSubtune = normalizeSubtune(n, state.metadata); },
  };
}

function normalizeSubtune(value, metadata) {
  const total = Math.max(1, Number(metadata?.subtuneCount || 1));
  const fallback = Math.max(1, Math.min(total, Number(metadata?.defaultSubtune || 1)));
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.max(1, Math.min(total, Math.trunc(n)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEqualizer(value = {}) {
  return {
    enabled: value.enabled !== false,
    bass: clampDb(value.bass),
    mid: clampDb(value.mid),
    treble: clampDb(value.treble),
  };
}

function clampDb(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-12, Math.min(12, Math.round(n)));
}

function loadStoredEqualizer() {
  try {
    const raw = globalThis.localStorage?.getItem(EQ_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EQUALIZER };
    return normalizeEqualizer({ ...DEFAULT_EQUALIZER, ...JSON.parse(raw) });
  } catch {
    return { ...DEFAULT_EQUALIZER };
  }
}

function saveStoredEqualizer(value) {
  try {
    globalThis.localStorage?.setItem(EQ_STORAGE_KEY, JSON.stringify(normalizeEqualizer(value)));
  } catch {}
}

// Map a friendly bitmask to the SDK trace mask array used by the Go WASM
// bridge. The Go side accepts strings: frames, cpu, bus, sid, sid.read, audio.
function traceMaskFromBits(bits) {
  const list = [];
  if (!bits) return ["none"];
  if (bits & 0x01) list.push("frames");
  if (bits & 0x02) list.push("cpu");
  if (bits & 0x04) list.push("bus");
  if (bits & 0x08) list.push("sid");
  if (bits & 0x10) list.push("sid.read");
  if (bits & 0x20) list.push("audio");
  return list;
}

export const TRACE = {
  frames:    0x01,
  cpuSteps:  0x02,
  busWrites: 0x04,
  sidWrites: 0x08,
  sidReads:  0x10,
  audio:     0x20,
};
