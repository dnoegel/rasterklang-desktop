// SID register / waveform / envelope reference data, decoders and helpers.
// Address space: $D400 .. $D41F (32 registers).

export const SID_BASE = 0xD400;

const VOICE_OFFSET = 7; // 0..6 voice 1, 7..13 voice 2, 14..20 voice 3.

export const REGISTER_MAP = [
  // Voice 1
  { addr: 0xD400, name: "FRELO1",  voice: 1, kind: "freq-lo",   purpose: "Frequency low byte (voice 1)" },
  { addr: 0xD401, name: "FREHI1",  voice: 1, kind: "freq-hi",   purpose: "Frequency high byte (voice 1)" },
  { addr: 0xD402, name: "PWLO1",   voice: 1, kind: "pw-lo",     purpose: "Pulse width low byte" },
  { addr: 0xD403, name: "PWHI1",   voice: 1, kind: "pw-hi",     purpose: "Pulse width high byte (4 bits)" },
  { addr: 0xD404, name: "VCREG1",  voice: 1, kind: "control",   purpose: "Waveform + gate + sync + ring + test" },
  { addr: 0xD405, name: "ATDCY1",  voice: 1, kind: "ad",        purpose: "Attack/decay envelope" },
  { addr: 0xD406, name: "SUREL1",  voice: 1, kind: "sr",        purpose: "Sustain/release envelope" },
  // Voice 2
  { addr: 0xD407, name: "FRELO2",  voice: 2, kind: "freq-lo",   purpose: "Frequency low byte (voice 2)" },
  { addr: 0xD408, name: "FREHI2",  voice: 2, kind: "freq-hi",   purpose: "Frequency high byte (voice 2)" },
  { addr: 0xD409, name: "PWLO2",   voice: 2, kind: "pw-lo",     purpose: "Pulse width low byte" },
  { addr: 0xD40A, name: "PWHI2",   voice: 2, kind: "pw-hi",     purpose: "Pulse width high byte (4 bits)" },
  { addr: 0xD40B, name: "VCREG2",  voice: 2, kind: "control",   purpose: "Waveform + gate + sync + ring + test" },
  { addr: 0xD40C, name: "ATDCY2",  voice: 2, kind: "ad",        purpose: "Attack/decay envelope" },
  { addr: 0xD40D, name: "SUREL2",  voice: 2, kind: "sr",        purpose: "Sustain/release envelope" },
  // Voice 3
  { addr: 0xD40E, name: "FRELO3",  voice: 3, kind: "freq-lo",   purpose: "Frequency low byte (voice 3)" },
  { addr: 0xD40F, name: "FREHI3",  voice: 3, kind: "freq-hi",   purpose: "Frequency high byte (voice 3)" },
  { addr: 0xD410, name: "PWLO3",   voice: 3, kind: "pw-lo",     purpose: "Pulse width low byte" },
  { addr: 0xD411, name: "PWHI3",   voice: 3, kind: "pw-hi",     purpose: "Pulse width high byte (4 bits)" },
  { addr: 0xD412, name: "VCREG3",  voice: 3, kind: "control",   purpose: "Waveform + gate + sync + ring + test" },
  { addr: 0xD413, name: "ATDCY3",  voice: 3, kind: "ad",        purpose: "Attack/decay envelope" },
  { addr: 0xD414, name: "SUREL3",  voice: 3, kind: "sr",        purpose: "Sustain/release envelope" },
  // Filter
  { addr: 0xD415, name: "CUTLO",   voice: 0, kind: "cutoff-lo", purpose: "Filter-Cutoff Lo (3 Bit)" },
  { addr: 0xD416, name: "CUTHI",   voice: 0, kind: "cutoff-hi", purpose: "Filter-Cutoff Hi (8 Bit)" },
  { addr: 0xD417, name: "RESON",   voice: 0, kind: "res-route", purpose: "Resonance + filter routing" },
  { addr: 0xD418, name: "SIGVOL",  voice: 0, kind: "vol-mode",  purpose: "Master volume + filter mode + V3 OFF" },
  // Read-only
  { addr: 0xD419, name: "POTX",    voice: 0, kind: "ro",        purpose: "Paddle X (read)" },
  { addr: 0xD41A, name: "POTY",    voice: 0, kind: "ro",        purpose: "Paddle Y (read)" },
  { addr: 0xD41B, name: "OSC3",    voice: 0, kind: "ro",        purpose: "Oscillator 3 output (read)" },
  { addr: 0xD41C, name: "ENV3",    voice: 0, kind: "ro",        purpose: "Envelope 3 level (read)" },
];

export function registerInfo(reg) {
  if (reg < 0 || reg >= REGISTER_MAP.length) return null;
  return REGISTER_MAP[reg];
}

export function registerInfoByAddress(addr) {
  return REGISTER_MAP.find(r => r.addr === addr) || null;
}

// Control register decoder ($D404, $D40B, $D412)
export function decodeControl(byte) {
  return {
    raw: byte,
    gate:     (byte & 0x01) !== 0,
    sync:     (byte & 0x02) !== 0,
    ringMod:  (byte & 0x04) !== 0,
    test:     (byte & 0x08) !== 0,
    triangle: (byte & 0x10) !== 0,
    sawtooth: (byte & 0x20) !== 0,
    pulse:    (byte & 0x40) !== 0,
    noise:    (byte & 0x80) !== 0,
  };
}

export function describeWaveforms(byte) {
  const ctrl = decodeControl(byte);
  const out = [];
  if (ctrl.triangle) out.push("triangle");
  if (ctrl.sawtooth) out.push("saw");
  if (ctrl.pulse)    out.push("pulse");
  if (ctrl.noise)    out.push("noise");
  if (out.length === 0) out.push("silent");
  return out;
}

// ATDCY -> attack high nibble, decay low nibble. Same for SUREL.
export function decodeADSR(adByte, srByte) {
  return {
    attack:  (adByte >> 4) & 0x0F,
    decay:   adByte & 0x0F,
    sustain: (srByte >> 4) & 0x0F,
    release: srByte & 0x0F,
  };
}

// Attack times in milliseconds for the 16 SID rates.
// Source: SID datasheet.
export const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];
// Decay/Release are 3x longer than attack at the same rate.
export const DECAY_MS = ATTACK_MS.map(v => v * 3);

// Sustain levels: linear 0..15 -> 0..1.0 amplitude factor.
export function sustainLevel(value) { return (value & 0x0F) / 15; }

// Convert SID frequency register value -> Hz.
// SID oscillator: f = (Fn * Fclk) / 2^24. PAL Fclk ~= 985248 Hz.
export function freqToHz(freqValue, cpuHz = 985248) {
  return (freqValue * cpuHz) / (1 << 24);
}

export function hzToFreq(hz, cpuHz = 985248) {
  return Math.round((hz * (1 << 24)) / cpuHz);
}

// Pulse width register -> duty fraction (0..1)
export function pwToDuty(pw) {
  // pw is 12 bits, 0..4095. 0 = fully wide, 4095 = fully narrow? Actually:
  // pulse output is HIGH when oscillator accumulator >= pulse-width.
  // duty = pw / 4096 in many references.
  return (pw & 0x0FFF) / 4096;
}

// Filter cutoff frequency in Hz - rough mapping (engine specific).
// 6581: ~30 Hz .. ~12 kHz over 0..2047.
export function cutoffToHz(cutoffRaw, model = "6581") {
  const min = model === "8580" ? 30 : 200;
  const max = model === "8580" ? 12000 : 12000;
  const t = (cutoffRaw & 0x07FF) / 2047;
  return min * Math.pow(max / min, t);
}

// Filter routing/resonance ($D417)
export function decodeFilterRouting(byte) {
  return {
    raw: byte,
    resonance: (byte >> 4) & 0x0F,
    filt1: (byte & 0x01) !== 0,
    filt2: (byte & 0x02) !== 0,
    filt3: (byte & 0x04) !== 0,
    filtX: (byte & 0x08) !== 0, // external in
  };
}

// Volume + filter mode + V3 OFF ($D418)
export function decodeVolumeMode(byte) {
  return {
    raw: byte,
    volume: byte & 0x0F,
    lp:  (byte & 0x10) !== 0,
    bp:  (byte & 0x20) !== 0,
    hp:  (byte & 0x40) !== 0,
    v3off: (byte & 0x80) !== 0,
  };
}

// MIDI note (A4=69 = 440 Hz) -> SID frequency register.
export function midiToFreq(note, cpuHz = 985248) {
  const hz = 440 * Math.pow(2, (note - 69) / 12);
  return hzToFreq(hz, cpuHz);
}

export function midiToHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export function noteName(midi) {
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const n = NAMES[midi % 12];
  const o = Math.floor(midi / 12) - 1;
  return `${n}${o}`;
}

// Build a register write recipe for "play note N with this preset on voice V".
// Returns sequential SID writes (reg 0..0x18) including gate-off / gate-on flow.
export function buildNotePreset({
  voice = 0,
  midi = 60,
  cpuHz = 985248,
  waveform = "pulse",
  pulseWidth = 2048,
  attack = 0,
  decay = 9,
  sustain = 12,
  release = 9,
  volume = 15,
  filterMode = "off",
  cutoff = 1024,
  resonance = 0,
  routeVoice = false,
}) {
  const base = voice * VOICE_OFFSET;
  const freq = midiToFreq(midi, cpuHz);
  const ctrl =
    (waveform === "triangle" ? 0x10 : 0) |
    (waveform === "sawtooth" ? 0x20 : 0) |
    (waveform === "pulse"    ? 0x40 : 0) |
    (waveform === "noise"    ? 0x80 : 0);

  const adByte = ((attack & 0x0F) << 4) | (decay & 0x0F);
  const srByte = ((sustain & 0x0F) << 4) | (release & 0x0F);

  const writes = [];
  const w = (offset, value, label) => writes.push({
    addr: SID_BASE + base + offset,
    reg: base + offset,
    value: value & 0xFF,
    label,
  });

  // Configure tone parameters (pre-gate so they take effect when gate fires).
  w(0, freq & 0xFF, "FRELO");
  w(1, (freq >> 8) & 0xFF, "FREHI");
  w(2, pulseWidth & 0xFF, "PWLO");
  w(3, (pulseWidth >> 8) & 0x0F, "PWHI");
  w(5, adByte, "ATDCY");
  w(6, srByte, "SUREL");

  // Filter
  let mode = 0;
  if (filterMode === "lp") mode = 0x10;
  if (filterMode === "bp") mode = 0x20;
  if (filterMode === "hp") mode = 0x40;
  writes.push({ addr: 0xD415, reg: 0x15, value: cutoff & 0x07, label: "CUTLO" });
  writes.push({ addr: 0xD416, reg: 0x16, value: (cutoff >> 3) & 0xFF, label: "CUTHI" });
  writes.push({ addr: 0xD417, reg: 0x17, value: ((resonance & 0x0F) << 4) | (routeVoice ? (1 << voice) : 0), label: "RESON" });
  writes.push({ addr: 0xD418, reg: 0x18, value: mode | (volume & 0x0F), label: "SIGVOL" });

  // Gate-on
  w(4, ctrl | 0x01, "VCREG (gate-on)");
  return { writes, freq, control: ctrl };
}

export const VOICE_COLORS = {
  1: "var(--voice-1)",
  2: "var(--voice-2)",
  3: "var(--voice-3)",
};

export const sidSpec = {
  REGISTER_MAP,
  registerInfo,
  registerInfoByAddress,
  decodeControl,
  describeWaveforms,
  decodeADSR,
  ATTACK_MS,
  DECAY_MS,
  sustainLevel,
  freqToHz,
  hzToFreq,
  pwToDuty,
  cutoffToHz,
  decodeFilterRouting,
  decodeVolumeMode,
  midiToFreq,
  midiToHz,
  noteName,
  buildNotePreset,
  VOICE_COLORS,
  SID_BASE,
};
