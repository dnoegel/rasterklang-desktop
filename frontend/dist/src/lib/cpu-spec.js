// Minimal 6502 instruction reference + tiny disassembler used by the
// learning/inspection sections. Not a full simulator -- the engine itself
// runs the real CPU. We only need to label opcodes, addressing modes, and
// describe what each instruction does for explanation purposes.

const M_IMP   = "implied";
const M_ACC   = "accumulator";
const M_IMM   = "immediate";
const M_ZP    = "zeropage";
const M_ZPX   = "zeropage,X";
const M_ZPY   = "zeropage,Y";
const M_ABS   = "absolute";
const M_ABSX  = "absolute,X";
const M_ABSY  = "absolute,Y";
const M_IND   = "indirect";
const M_INDX  = "(indirect,X)";
const M_INDY  = "(indirect),Y";
const M_REL   = "relative";

// Rich descriptions for the instructions that matter most in player code.
const FAMILIES = {
  LDA: { kind: "load",     summary: "Load accumulator A.",    sets: ["A", "N", "Z"] },
  LDX: { kind: "load",     summary: "Load X register.",       sets: ["X", "N", "Z"] },
  LDY: { kind: "load",     summary: "Load Y register.",       sets: ["Y", "N", "Z"] },
  STA: { kind: "store",    summary: "Store A in memory.", sets: ["mem"] },
  STX: { kind: "store",    summary: "Store X in memory.", sets: ["mem"] },
  STY: { kind: "store",    summary: "Store Y in memory.", sets: ["mem"] },
  TAX: { kind: "transfer", summary: "A -> X.", sets: ["X", "N", "Z"] },
  TAY: { kind: "transfer", summary: "A -> Y.", sets: ["Y", "N", "Z"] },
  TXA: { kind: "transfer", summary: "X -> A.", sets: ["A", "N", "Z"] },
  TYA: { kind: "transfer", summary: "Y -> A.", sets: ["A", "N", "Z"] },
  TSX: { kind: "transfer", summary: "SP -> X.", sets: ["X", "N", "Z"] },
  TXS: { kind: "transfer", summary: "X -> SP.", sets: ["SP"] },
  ADC: { kind: "alu",      summary: "Add with carry.", sets: ["A", "N", "Z", "C", "V"] },
  SBC: { kind: "alu",      summary: "Subtract with carry.", sets: ["A", "N", "Z", "C", "V"] },
  AND: { kind: "alu",      summary: "Bit-AND.", sets: ["A", "N", "Z"] },
  ORA: { kind: "alu",      summary: "Bit-OR.",  sets: ["A", "N", "Z"] },
  EOR: { kind: "alu",      summary: "Bit-XOR.", sets: ["A", "N", "Z"] },
  CMP: { kind: "alu",      summary: "Compare A.", sets: ["N", "Z", "C"] },
  CPX: { kind: "alu",      summary: "Compare X.", sets: ["N", "Z", "C"] },
  CPY: { kind: "alu",      summary: "Compare Y.", sets: ["N", "Z", "C"] },
  INC: { kind: "alu",      summary: "Increment memory.", sets: ["mem", "N", "Z"] },
  INX: { kind: "alu",      summary: "X +1.", sets: ["X", "N", "Z"] },
  INY: { kind: "alu",      summary: "Y +1.", sets: ["Y", "N", "Z"] },
  DEC: { kind: "alu",      summary: "Decrement memory.", sets: ["mem", "N", "Z"] },
  DEX: { kind: "alu",      summary: "X -1.", sets: ["X", "N", "Z"] },
  DEY: { kind: "alu",      summary: "Y -1.", sets: ["Y", "N", "Z"] },
  ASL: { kind: "alu",      summary: "Arithmetic shift left.", sets: ["A?", "mem?", "N", "Z", "C"] },
  LSR: { kind: "alu",      summary: "Logical shift right.", sets: ["A?", "mem?", "N", "Z", "C"] },
  ROL: { kind: "alu",      summary: "Rotate left through carry.", sets: ["A?", "mem?", "N", "Z", "C"] },
  ROR: { kind: "alu",      summary: "Rotate right through carry.", sets: ["A?", "mem?", "N", "Z", "C"] },
  BIT: { kind: "alu",      summary: "Bit test (AND without storing).", sets: ["N", "V", "Z"] },
  CLC: { kind: "flag",     summary: "C = 0.", sets: ["C"] },
  SEC: { kind: "flag",     summary: "C = 1.", sets: ["C"] },
  CLI: { kind: "flag",     summary: "Clear interrupt disable.", sets: ["I"] },
  SEI: { kind: "flag",     summary: "Set interrupt disable.", sets: ["I"] },
  CLD: { kind: "flag",     summary: "Clear decimal mode.", sets: ["D"] },
  SED: { kind: "flag",     summary: "Set decimal mode.", sets: ["D"] },
  CLV: { kind: "flag",     summary: "V = 0.", sets: ["V"] },
  JMP: { kind: "branch",   summary: "Jump.", sets: ["PC"] },
  JSR: { kind: "branch",   summary: "Jump to subroutine; return address on stack.", sets: ["PC", "SP", "stack"] },
  RTS: { kind: "branch",   summary: "Return from subroutine.", sets: ["PC", "SP"] },
  RTI: { kind: "branch",   summary: "Return from IRQ (PC + flags).", sets: ["PC", "P", "SP"] },
  BCC: { kind: "branch",   summary: "Branch if C = 0.", sets: ["PC"] },
  BCS: { kind: "branch",   summary: "Branch if C = 1.", sets: ["PC"] },
  BEQ: { kind: "branch",   summary: "Branch if Z = 1.", sets: ["PC"] },
  BNE: { kind: "branch",   summary: "Branch if Z = 0.", sets: ["PC"] },
  BMI: { kind: "branch",   summary: "Branch if N = 1.", sets: ["PC"] },
  BPL: { kind: "branch",   summary: "Branch if N = 0.", sets: ["PC"] },
  BVC: { kind: "branch",   summary: "Branch if V = 0.", sets: ["PC"] },
  BVS: { kind: "branch",   summary: "Branch if V = 1.", sets: ["PC"] },
  PHA: { kind: "stack",    summary: "Push A.", sets: ["SP", "stack"] },
  PHP: { kind: "stack",    summary: "Push flags.", sets: ["SP", "stack"] },
  PLA: { kind: "stack",    summary: "Pull A.", sets: ["A", "SP", "N", "Z"] },
  PLP: { kind: "stack",    summary: "Pull flags.", sets: ["P", "SP"] },
  NOP: { kind: "misc",     summary: "No operation." , sets: [] },
  BRK: { kind: "misc",     summary: "Software-Interrupt." , sets: ["PC", "P", "stack"] },
};

// Minimal opcode table for instructions actually used by SID players.
const OPCODES = {
  // LDA
  0xA9: ["LDA", M_IMM,  2, 2],
  0xA5: ["LDA", M_ZP,   2, 3],
  0xB5: ["LDA", M_ZPX,  2, 4],
  0xAD: ["LDA", M_ABS,  3, 4],
  0xBD: ["LDA", M_ABSX, 3, 4],
  0xB9: ["LDA", M_ABSY, 3, 4],
  0xA1: ["LDA", M_INDX, 2, 6],
  0xB1: ["LDA", M_INDY, 2, 5],
  // LDX
  0xA2: ["LDX", M_IMM,  2, 2],
  0xA6: ["LDX", M_ZP,   2, 3],
  0xB6: ["LDX", M_ZPY,  2, 4],
  0xAE: ["LDX", M_ABS,  3, 4],
  0xBE: ["LDX", M_ABSY, 3, 4],
  // LDY
  0xA0: ["LDY", M_IMM,  2, 2],
  0xA4: ["LDY", M_ZP,   2, 3],
  0xB4: ["LDY", M_ZPX,  2, 4],
  0xAC: ["LDY", M_ABS,  3, 4],
  0xBC: ["LDY", M_ABSX, 3, 4],
  // STA
  0x85: ["STA", M_ZP,   2, 3],
  0x95: ["STA", M_ZPX,  2, 4],
  0x8D: ["STA", M_ABS,  3, 4],
  0x9D: ["STA", M_ABSX, 3, 5],
  0x99: ["STA", M_ABSY, 3, 5],
  0x81: ["STA", M_INDX, 2, 6],
  0x91: ["STA", M_INDY, 2, 6],
  // STX
  0x86: ["STX", M_ZP,   2, 3],
  0x96: ["STX", M_ZPY,  2, 4],
  0x8E: ["STX", M_ABS,  3, 4],
  // STY
  0x84: ["STY", M_ZP,   2, 3],
  0x94: ["STY", M_ZPX,  2, 4],
  0x8C: ["STY", M_ABS,  3, 4],
  // Transfers
  0xAA: ["TAX", M_IMP,  1, 2], 0xA8: ["TAY", M_IMP, 1, 2],
  0x8A: ["TXA", M_IMP,  1, 2], 0x98: ["TYA", M_IMP, 1, 2],
  0xBA: ["TSX", M_IMP,  1, 2], 0x9A: ["TXS", M_IMP, 1, 2],
  // Inc/Dec
  0xE8: ["INX", M_IMP,  1, 2], 0xC8: ["INY", M_IMP, 1, 2],
  0xCA: ["DEX", M_IMP,  1, 2], 0x88: ["DEY", M_IMP, 1, 2],
  0xE6: ["INC", M_ZP,   2, 5], 0xF6: ["INC", M_ZPX, 2, 6], 0xEE: ["INC", M_ABS, 3, 6], 0xFE: ["INC", M_ABSX, 3, 7],
  0xC6: ["DEC", M_ZP,   2, 5], 0xD6: ["DEC", M_ZPX, 2, 6], 0xCE: ["DEC", M_ABS, 3, 6], 0xDE: ["DEC", M_ABSX, 3, 7],
  // Logical / arithmetic
  0x29: ["AND", M_IMM,  2, 2], 0x09: ["ORA", M_IMM, 2, 2], 0x49: ["EOR", M_IMM, 2, 2],
  0x69: ["ADC", M_IMM,  2, 2], 0xE9: ["SBC", M_IMM, 2, 2],
  0xC9: ["CMP", M_IMM,  2, 2], 0xE0: ["CPX", M_IMM, 2, 2], 0xC0: ["CPY", M_IMM, 2, 2],
  0x0A: ["ASL", M_ACC,  1, 2], 0x4A: ["LSR", M_ACC, 1, 2],
  0x2A: ["ROL", M_ACC,  1, 2], 0x6A: ["ROR", M_ACC, 1, 2],
  // Flags
  0x18: ["CLC", M_IMP,  1, 2], 0x38: ["SEC", M_IMP, 1, 2],
  0x58: ["CLI", M_IMP,  1, 2], 0x78: ["SEI", M_IMP, 1, 2],
  0xD8: ["CLD", M_IMP,  1, 2], 0xF8: ["SED", M_IMP, 1, 2],
  0xB8: ["CLV", M_IMP,  1, 2],
  // Branches
  0x90: ["BCC", M_REL,  2, 2], 0xB0: ["BCS", M_REL, 2, 2],
  0xF0: ["BEQ", M_REL,  2, 2], 0xD0: ["BNE", M_REL, 2, 2],
  0x30: ["BMI", M_REL,  2, 2], 0x10: ["BPL", M_REL, 2, 2],
  0x50: ["BVC", M_REL,  2, 2], 0x70: ["BVS", M_REL, 2, 2],
  // Jumps
  0x4C: ["JMP", M_ABS,  3, 3], 0x6C: ["JMP", M_IND, 3, 5],
  0x20: ["JSR", M_ABS,  3, 6],
  0x60: ["RTS", M_IMP,  1, 6],
  0x40: ["RTI", M_IMP,  1, 6],
  // Stack
  0x48: ["PHA", M_IMP,  1, 3], 0x08: ["PHP", M_IMP, 1, 3],
  0x68: ["PLA", M_IMP,  1, 4], 0x28: ["PLP", M_IMP, 1, 4],
  // Misc
  0xEA: ["NOP", M_IMP,  1, 2], 0x00: ["BRK", M_IMP, 1, 7],
};

export function opcodeInfo(byte) {
  const entry = OPCODES[byte];
  if (!entry) return { mnemonic: "???", mode: M_IMP, length: 1, cycles: 0, family: null };
  const [mnemonic, mode, length, cycles] = entry;
  const family = FAMILIES[mnemonic] || null;
  return { mnemonic, mode, length, cycles, family };
}

export function flagDescription(p) {
  return {
    N: !!(p & 0x80),
    V: !!(p & 0x40),
    B: !!(p & 0x10),
    D: !!(p & 0x08),
    I: !!(p & 0x04),
    Z: !!(p & 0x02),
    C: !!(p & 0x01),
  };
}

export function describeAddressing(mode, bytes, pc) {
  const lo = bytes[1] || 0;
  const hi = bytes[2] || 0;
  const word = lo | (hi << 8);
  switch (mode) {
    case M_IMP: return "";
    case M_ACC: return "A";
    case M_IMM: return `#$${hex(lo, 2)}`;
    case M_ZP:  return `$${hex(lo, 2)}`;
    case M_ZPX: return `$${hex(lo, 2)},X`;
    case M_ZPY: return `$${hex(lo, 2)},Y`;
    case M_ABS: return `$${hex(word, 4)}`;
    case M_ABSX: return `$${hex(word, 4)},X`;
    case M_ABSY: return `$${hex(word, 4)},Y`;
    case M_IND: return `($${hex(word, 4)})`;
    case M_INDX: return `($${hex(lo, 2)},X)`;
    case M_INDY: return `($${hex(lo, 2)}),Y`;
    case M_REL: {
      const target = (pc + 2 + ((lo << 24) >> 24)) & 0xFFFF;
      return `$${hex(target, 4)}`;
    }
    default: return "";
  }
}

function hex(n, w) { return Number(n).toString(16).toUpperCase().padStart(w, "0"); }

// Disassemble a small range of bytes starting at PC. Returns a list of
// { pc, bytes, mnemonic, mode, operand, length, cycles, comment }.
export function disassemble(memory, pc, count = 16) {
  const out = [];
  let cursor = pc;
  for (let i = 0; i < count; i += 1) {
    const op = memory[cursor] || 0;
    const info = opcodeInfo(op);
    const bytes = [op];
    for (let b = 1; b < info.length; b += 1) bytes.push(memory[(cursor + b) & 0xFFFF] || 0);
    out.push({
      pc: cursor & 0xFFFF,
      bytes,
      mnemonic: info.mnemonic,
      mode: info.mode,
      operand: describeAddressing(info.mode, bytes, cursor),
      length: info.length,
      cycles: info.cycles,
    });
    cursor = (cursor + info.length) & 0xFFFF;
  }
  return out;
}

export const cpuSpec = {
  opcodeInfo,
  flagDescription,
  describeAddressing,
  disassemble,
  FAMILIES,
};
