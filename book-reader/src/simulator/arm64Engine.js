// ARM64 (AArch64) Instruction Set Simulator & Execution Engine
// Modeled for interactive learning, step-debugging, and CPULator-style visualization

const MASK_64 = 0xFFFFFFFFFFFFFFFFn;
const MASK_32 = 0xFFFFFFFFn;
const SIGN_BIT_64 = 0x8000000000000000n;
const SIGN_BIT_32 = 0x80000000n;

export const DEFAULT_PC = 0x00400000n;
export const DEFAULT_DATA_ADDR = 0x00410000n;
export const DEFAULT_SP = 0x007FFFF0n;

export class ARM64Simulator {
  constructor() {
    this.reset();
  }

  reset() {
    // 31 General Purpose 64-bit registers: X0 - X30
    this.x = new Array(31).fill(0n);
    this.sp = DEFAULT_SP;
    this.pc = DEFAULT_PC;

    // Condition Flags (PSTATE / NZCV)
    this.flags = {
      N: 0, // Negative
      Z: 1, // Zero
      C: 0, // Carry
      V: 0  // Overflow
    };

    // Memory: Map<bigint, number (byte)>
    this.memory = new Map();

    // Source mapping & program state
    this.instructions = []; // Array of parsed instruction objects
    this.labels = new Map(); // labelName -> PC address
    this.dataLabels = new Map(); // labelName -> memory address
    this.sourceLines = []; // Raw source lines
    this.pcToLineIndex = new Map(); // pc (BigInt) -> line index (0-based)
    this.lineToPc = new Map(); // line index -> pc (BigInt)

    // Execution state
    this.isAssembled = false;
    this.isTerminated = false;
    this.exitCode = null;
    this.cycleCount = 0;
    this.changedRegisters = new Set();
    this.stdout = '';
    this.stderr = '';
    this.lastError = null;

    // Breakpoints: Set of line indices (0-based)
    this.breakpoints = new Set();
  }

  // Memory access helpers (Little-Endian)
  readByte(addr) {
    return this.memory.get(BigInt(addr)) ?? 0;
  }

  writeByte(addr, val) {
    this.memory.set(BigInt(addr), Number(val) & 0xFF);
  }

  readHalfword(addr) {
    const b0 = BigInt(this.readByte(addr));
    const b1 = BigInt(this.readByte(addr + 1n));
    return (b1 << 8n) | b0;
  }

  writeHalfword(addr, val) {
    const v = BigInt(val);
    this.writeByte(addr, Number(v & 0xFFn));
    this.writeByte(addr + 1n, Number((v >> 8n) & 0xFFn));
  }

  readWord(addr) {
    let res = 0n;
    for (let i = 0n; i < 4n; i++) {
      res |= BigInt(this.readByte(addr + i)) << (i * 8n);
    }
    return res & MASK_32;
  }

  writeWord(addr, val) {
    let v = BigInt(val) & MASK_32;
    for (let i = 0n; i < 4n; i++) {
      this.writeByte(addr + i, Number(v & 0xFFn));
      v >>= 8n;
    }
  }

  readQuad(addr) {
    let res = 0n;
    for (let i = 0n; i < 8n; i++) {
      res |= BigInt(this.readByte(addr + i)) << (i * 8n);
    }
    return res & MASK_64;
  }

  writeQuad(addr, val) {
    let v = BigInt(val) & MASK_64;
    for (let i = 0n; i < 8n; i++) {
      this.writeByte(addr + i, Number(v & 0xFFn));
      v >>= 8n;
    }
  }

  readString(addr, maxLen = 256) {
    let s = '';
    let curr = BigInt(addr);
    for (let i = 0; i < maxLen; i++) {
      const b = this.readByte(curr + BigInt(i));
      if (b === 0) break;
      s += String.fromCharCode(b);
    }
    return s;
  }

  // Register access helpers
  getReg(regName) {
    const name = regName.toLowerCase();
    if (name === 'xzr' || name === 'wzr') return 0n;
    if (name === 'sp') return this.sp;
    if (name === 'pc') return this.pc;
    if (name === 'lr') return this.x[30];
    if (name === 'fp') return this.x[29];

    if (name.startsWith('x')) {
      const idx = parseInt(name.slice(1), 10);
      if (idx >= 0 && idx < 31) return this.x[idx];
    } else if (name.startsWith('w')) {
      const idx = parseInt(name.slice(1), 10);
      if (idx >= 0 && idx < 31) return this.x[idx] & MASK_32;
    }
    return 0n;
  }

  setReg(regName, val) {
    const name = regName.toLowerCase();
    if (name === 'xzr' || name === 'wzr') return; // Read-only 0
    if (name === 'sp') {
      this.sp = BigInt(val) & MASK_64;
      this.changedRegisters.add('sp');
      return;
    }
    if (name === 'pc') {
      this.pc = BigInt(val) & MASK_64;
      return;
    }
    if (name === 'lr') {
      this.x[30] = BigInt(val) & MASK_64;
      this.changedRegisters.add('x30');
      return;
    }
    if (name === 'fp') {
      this.x[29] = BigInt(val) & MASK_64;
      this.changedRegisters.add('x29');
      return;
    }

    if (name.startsWith('x')) {
      const idx = parseInt(name.slice(1), 10);
      if (idx >= 0 && idx < 31) {
        this.x[idx] = BigInt(val) & MASK_64;
        this.changedRegisters.add(`x${idx}`);
      }
    } else if (name.startsWith('w')) {
      const idx = parseInt(name.slice(1), 10);
      if (idx >= 0 && idx < 31) {
        // Writing 32-bit W register in AArch64 zero-extends upper 32 bits!
        this.x[idx] = BigInt(val) & MASK_32;
        this.changedRegisters.add(`x${idx}`);
      }
    }
  }

  toSigned64(val) {
    const v = BigInt(val) & MASK_64;
    return (v & SIGN_BIT_64) ? v - 0x10000000000000000n : v;
  }

  toSigned32(val) {
    const v = BigInt(val) & MASK_32;
    return (v & SIGN_BIT_32) ? v - 0x100000000n : v;
  }

  // Two-pass Assembler
  assemble(sourceCode) {
    this.reset();
    this.sourceLines = sourceCode.split('\n');
    const rawLines = this.sourceLines;

    let currentSection = 'text'; // 'text' | 'data' | 'rodata' | 'bss'
    let currentTextPc = DEFAULT_PC;
    let currentDataAddr = DEFAULT_DATA_ADDR;

    const parsedInstructions = [];
    const labels = new Map();
    const dataLabels = new Map();
    const equSymbols = new Map();

    // Pass 1: Parse sections, directives, labels, and collect instructions
    for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex++) {
      let line = rawLines[lineIndex].trim();
      // Remove comments (// or ;)
      const commentIdx = line.search(/(\/\/|;)/);
      if (commentIdx !== -1) {
        line = line.substring(0, commentIdx).trim();
      }
      if (!line) continue;

      // Handle directives
      if (line.startsWith('.')) {
        const parts = line.split(/\s+/);
        const dir = parts[0].toLowerCase();

        if (dir === '.text') {
          currentSection = 'text';
          continue;
        } else if (dir === '.data' || dir === '.rodata' || dir === '.bss') {
          currentSection = 'data';
          continue;
        } else if (dir === '.global' || dir === '.globl' || dir === '.align') {
          continue;
        } else if (dir === '.equ') {
          const rest = line.substring(4).trim();
          const [sym, valStr] = rest.split(',').map(s => s.trim());
          if (sym && valStr) {
            equSymbols.set(sym, this.parseImmediate(valStr, equSymbols));
          }
          continue;
        }
      }

      // Check for labels (e.g. `_start:`, `main:`, `msg: .asciz "hello"`)
      const labelMatch = line.match(/^([a-zA-Z0-9_$.]+):\s*(.*)$/);
      let instructionPart = line;

      if (labelMatch) {
        const labelName = labelMatch[1];
        instructionPart = labelMatch[2].trim();

        if (currentSection === 'text') {
          labels.set(labelName, currentTextPc);
        } else {
          dataLabels.set(labelName, currentDataAddr);
        }
      }

      if (!instructionPart) continue;

      if (currentSection === 'data') {
        // Data directives like .asciz, .ascii, .string, .word, .quad, .byte
        const parts = instructionPart.split(/\s+/);
        const directive = parts[0].toLowerCase();
        const argString = instructionPart.substring(parts[0].length).trim();

        if (directive === '.asciz' || directive === '.ascii' || directive === '.string') {
          const match = argString.match(/^"([^"]*)"/);
          if (match) {
            let str = match[1];
            // Resolve escape sequences
            str = str.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\0/g, '\0');
            for (let i = 0; i < str.length; i++) {
              this.writeByte(currentDataAddr++, str.charCodeAt(i));
            }
            if (directive !== '.ascii') {
              this.writeByte(currentDataAddr++, 0); // null terminator
            }
          }
        } else if (directive === '.byte') {
          const vals = argString.split(',').map(v => this.parseImmediate(v.trim(), equSymbols));
          for (const v of vals) {
            this.writeByte(currentDataAddr++, Number(v & 0xFFn));
          }
        } else if (directive === '.word') {
          const vals = argString.split(',').map(v => this.parseImmediate(v.trim(), equSymbols));
          for (const v of vals) {
            this.writeWord(currentDataAddr, v);
            currentDataAddr += 4n;
          }
        } else if (directive === '.quad') {
          const vals = argString.split(',').map(v => this.parseImmediate(v.trim(), equSymbols));
          for (const v of vals) {
            this.writeQuad(currentDataAddr, v);
            currentDataAddr += 8n;
          }
        } else if (directive === '.space' || directive === '.skip') {
          const count = Number(this.parseImmediate(argString, equSymbols));
          for (let i = 0; i < count; i++) {
            this.writeByte(currentDataAddr++, 0);
          }
        }
      } else {
        // Text section instruction
        parsedInstructions.push({
          pc: currentTextPc,
          lineIndex,
          rawText: instructionPart,
          op: '',
          args: []
        });
        this.pcToLineIndex.set(currentTextPc, lineIndex);
        if (!this.lineToPc.has(lineIndex)) {
          this.lineToPc.set(lineIndex, currentTextPc);
        }
        currentTextPc += 4n;
      }
    }

    // Pass 2: Parse instructions and arguments
    for (const inst of parsedInstructions) {
      const parsed = this.parseInstructionText(inst.rawText);
      inst.op = parsed.op;
      inst.args = parsed.args;
    }

    this.instructions = parsedInstructions;
    this.labels = labels;
    this.dataLabels = dataLabels;

    // Determine initial entry point PC
    if (labels.has('_start')) {
      this.pc = labels.get('_start');
    } else if (labels.has('main')) {
      this.pc = labels.get('main');
    } else if (labels.has('_main')) {
      this.pc = labels.get('_main');
    } else if (parsedInstructions.length > 0) {
      this.pc = parsedInstructions[0].pc;
    }

    this.isAssembled = true;
    return {
      success: true,
      instructionCount: parsedInstructions.length,
      entryPc: this.pc
    };
  }

  parseInstructionText(text) {
    const spaceIdx = text.search(/\s/);
    if (spaceIdx === -1) {
      return { op: text.toLowerCase(), args: [] };
    }

    const op = text.substring(0, spaceIdx).trim().toLowerCase();
    const rest = text.substring(spaceIdx).trim();

    // Parse comma-separated arguments while respecting bracketed memory operands like [sp, #-16]!
    const args = [];
    let current = '';
    let insideBrackets = false;

    for (let i = 0; i < rest.length; i++) {
      const char = rest[i];
      if (char === '[') insideBrackets = true;
      if (char === ']') insideBrackets = false;

      if (char === ',' && !insideBrackets) {
        if (current.trim()) args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) args.push(current.trim());

    return { op, args };
  }

  parseImmediate(valStr, symbols = new Map()) {
    let str = valStr.trim();
    if (str.startsWith('#')) str = str.slice(1).trim();

    if (symbols.has(str)) return symbols.get(str);
    if (this.dataLabels.has(str)) return this.dataLabels.get(str);
    if (this.labels.has(str)) return this.labels.get(str);

    // Negative hex or dec
    let isNeg = false;
    if (str.startsWith('-')) {
      isNeg = true;
      str = str.slice(1).trim();
    }

    try {
      let val = 0n;
      if (str.startsWith('0x') || str.startsWith('0X')) {
        val = BigInt(str);
      } else if (str.startsWith('0b') || str.startsWith('0B')) {
        val = BigInt(str);
      } else if (/^\d+$/.test(str)) {
        val = BigInt(str);
      } else if (str.startsWith("'") && str.endsWith("'") && str.length === 3) {
        val = BigInt(str.charCodeAt(1));
      } else {
        return 0n;
      }
      return isNeg ? (-val & MASK_64) : val;
    } catch {
      return 0n;
    }
  }

  resolveOperand(opStr) {
    let s = opStr.trim();
    if (s.startsWith('#')) {
      return this.parseImmediate(s);
    }
    if (this.dataLabels.has(s)) {
      return this.dataLabels.get(s);
    }
    if (this.labels.has(s)) {
      return this.labels.get(s);
    }
    // Check if it's a register
    return this.getReg(s);
  }

  // Parse memory operand like `[x0]`, `[sp, #16]`, `[sp, #-16]!`, `[sp], #16`, `[x0, x1]`
  parseMemOperand(opStr) {
    let s = opStr.trim();
    const postIndexed = s.includes('],');
    const preIndexed = s.endsWith('!');

    let baseReg;
    let offset = 0n;
    let offsetReg = null;
    let regShift = 0;

    if (postIndexed) {
      // e.g. `[sp], #16`
      const match = s.match(/\[([a-zA-Z0-9]+)\],\s*(.*)/);
      if (match) {
        baseReg = match[1];
        offset = this.parseImmediate(match[2]);
        return { baseReg, offset, type: 'post', writeback: true };
      }
    } else if (preIndexed) {
      // e.g. `[sp, #-16]!`
      const inner = s.slice(1, -2).trim(); // remove '[' and ']!'
      const parts = inner.split(',').map(p => p.trim());
      baseReg = parts[0];
      if (parts[1]) offset = this.parseImmediate(parts[1]);
      return { baseReg, offset, type: 'pre', writeback: true };
    } else {
      // e.g. `[x0]` or `[x0, #8]` or `[x0, x1]` or `[x0, x1, lsl #3]`
      const match = s.match(/\[(.*)\]/);
      if (match) {
        const parts = match[1].split(',').map(p => p.trim());
        baseReg = parts[0];
        if (parts[1]) {
          if (parts[1].startsWith('#') || /^-?\d/.test(parts[1]) || parts[1].startsWith('0x')) {
            offset = this.parseImmediate(parts[1]);
          } else {
            offsetReg = parts[1];
            if (parts[2]) {
              const shiftMatch = parts[2].match(/(?:lsl|uxtw|sxtw)\s*#?(\d+)/i);
              if (shiftMatch) {
                regShift = parseInt(shiftMatch[1], 10);
              }
            }
          }
        }
        return { baseReg, offset, offsetReg, regShift, type: 'standard', writeback: false };
      }
    }

    return { baseReg: 'sp', offset: 0n, type: 'standard', writeback: false };
  }

  // Update Condition Flags
  updateFlagsAdd(res, op1, op2, is32Bit = false) {
    const mask = is32Bit ? MASK_32 : MASK_64;
    const signBit = is32Bit ? SIGN_BIT_32 : SIGN_BIT_64;

    const r = res & mask;
    const s1 = op1 & mask;
    const s2 = op2 & mask;

    this.flags.Z = r === 0n ? 1 : 0;
    this.flags.N = (r & signBit) ? 1 : 0;
    // Carry out: true if r < s1 (unsigned overflow)
    this.flags.C = r < s1 ? 1 : 0;
    // Overflow: signed overflow occurs when both operands have same sign, but result has different sign
    const signR = (r & signBit) !== 0n;
    const sign1 = (s1 & signBit) !== 0n;
    const sign2 = (s2 & signBit) !== 0n;
    this.flags.V = (sign1 === sign2 && sign1 !== signR) ? 1 : 0;
  }

  updateFlagsSub(res, op1, op2, is32Bit = false) {
    const mask = is32Bit ? MASK_32 : MASK_64;
    const signBit = is32Bit ? SIGN_BIT_32 : SIGN_BIT_64;

    const r = res & mask;
    const s1 = op1 & mask;
    const s2 = op2 & mask;

    this.flags.Z = r === 0n ? 1 : 0;
    this.flags.N = (r & signBit) ? 1 : 0;
    // In ARM, Carry flag is set on subtraction if NO borrow occurs (s1 >= s2 unsigned)
    this.flags.C = s1 >= s2 ? 1 : 0;
    // Overflow: occurs if operands have different signs, and result sign differs from first operand
    const signR = (r & signBit) !== 0n;
    const sign1 = (s1 & signBit) !== 0n;
    const sign2 = (s2 & signBit) !== 0n;
    this.flags.V = (sign1 !== sign2 && sign1 !== signR) ? 1 : 0;
  }

  updateFlagsLogic(res, is32Bit = false) {
    const mask = is32Bit ? MASK_32 : MASK_64;
    const signBit = is32Bit ? SIGN_BIT_32 : SIGN_BIT_64;

    const r = res & mask;
    this.flags.Z = r === 0n ? 1 : 0;
    this.flags.N = (r & signBit) ? 1 : 0;
    this.flags.C = 0;
    this.flags.V = 0;
  }

  evalCondition(cond) {
    const { N, Z, C, V } = this.flags;
    switch (cond.toLowerCase()) {
      case 'eq': return Z === 1;
      case 'ne': return Z === 0;
      case 'cs':
      case 'hs': return C === 1;
      case 'cc':
      case 'lo': return C === 0;
      case 'mi': return N === 1;
      case 'pl': return N === 0;
      case 'vs': return V === 1;
      case 'vc': return V === 0;
      case 'hi': return C === 1 && Z === 0;
      case 'ls': return C === 0 || Z === 1;
      case 'ge': return N === V;
      case 'lt': return N !== V;
      case 'gt': return Z === 0 && N === V;
      case 'le': return Z === 1 || N !== V;
      case 'al': return true;
      default: return false;
    }
  }

  // Handle Linux AArch64 System Calls & CRT wrappers
  handleSyscall() {
    const sysNum = Number(this.getReg('x8'));
    switch (sysNum) {
      case 64: { // sys_write (fd, buf, count)
        const fd = Number(this.getReg('x0'));
        const buf = this.getReg('x1');
        const count = Number(this.getReg('x2'));
        let out = '';
        for (let i = 0; i < count; i++) {
          const byte = this.readByte(buf + BigInt(i));
          out += String.fromCharCode(byte);
        }
        if (fd === 1) {
          this.stdout += out;
        } else if (fd === 2) {
          this.stderr += out;
        }
        this.setReg('x0', BigInt(count));
        break;
      }
      case 93: { // sys_exit (status)
        const code = Number(this.getReg('x0'));
        this.exitCode = code;
        this.isTerminated = true;
        this.stdout += `\n[Program exited with code ${code}]\n`;
        break;
      }
      case 172: { // sys_getpid
        this.setReg('x0', 1337n);
        break;
      }
      default: {
        this.stdout += `[Unknown syscall x8=${sysNum}]\n`;
        this.setReg('x0', 0n);
        break;
      }
    }
  }

  handleCrtCall(funcName) {
    const fn = funcName.replace(/^_/, '').toLowerCase();
    switch (fn) {
      case 'puts': {
        const strAddr = this.getReg('x0');
        const str = this.readString(strAddr);
        this.stdout += str + '\n';
        this.setReg('x0', 0n);
        return true;
      }
      case 'putchar': {
        const charCode = Number(this.getReg('x0') & 0xFFn);
        this.stdout += String.fromCharCode(charCode);
        this.setReg('x0', BigInt(charCode));
        return true;
      }
      case 'printf': {
        const fmtAddr = this.getReg('x0');
        const fmt = this.readString(fmtAddr);
        // Basic format string parser for %d, %s, %x, %c
        let argIdx = 1;
        let formatted = fmt.replace(/%([%dscxlu])/g, (match, specifier) => {
          if (specifier === '%') return '%';
          const regVal = this.getReg(`x${argIdx++}`);
          if (specifier === 's') return this.readString(regVal);
          if (specifier === 'd') return this.toSigned64(regVal).toString();
          if (specifier === 'x') return (regVal & MASK_64).toString(16);
          if (specifier === 'lu' || specifier === 'u') return (regVal & MASK_64).toString();
          if (specifier === 'c') return String.fromCharCode(Number(regVal & 0xFFn));
          return match;
        });
        this.stdout += formatted;
        this.setReg('x0', BigInt(formatted.length));
        return true;
      }
      case 'exit': {
        const code = Number(this.getReg('x0'));
        this.exitCode = code;
        this.isTerminated = true;
        this.stdout += `\n[Program exited with code ${code}]\n`;
        return true;
      }
      default:
        return false;
    }
  }

  // Execute a single instruction at current PC
  step() {
    if (this.isTerminated) {
      return { status: 'terminated', message: 'Program has terminated' };
    }

    const inst = this.instructions.find(i => i.pc === this.pc);
    if (!inst) {
      this.isTerminated = true;
      return { status: 'error', message: `No instruction found at address 0x${this.pc.toString(16)}` };
    }

    this.changedRegisters.clear();
    const nextDefaultPc = this.pc + 4n;
    let nextPc = nextDefaultPc;
    const op = inst.op;
    const args = inst.args;
    const is32 = args[0]?.toLowerCase().startsWith('w');

    try {
      switch (op) {
        // Data Movement
        case 'mov': {
          const val = this.resolveOperand(args[1]);
          this.setReg(args[0], val);
          break;
        }
        case 'mvn': {
          const val = this.resolveOperand(args[1]);
          const mask = is32 ? MASK_32 : MASK_64;
          this.setReg(args[0], (~val) & mask);
          break;
        }
        case 'adr':
        case 'adrp': {
          const target = args[1].trim();
          let addr = 0n;
          if (this.dataLabels.has(target)) addr = this.dataLabels.get(target);
          else if (this.labels.has(target)) addr = this.labels.get(target);
          else addr = this.parseImmediate(target);

          if (op === 'adrp') {
            addr = addr & ~0xFFFn; // Page aligned
          }
          this.setReg(args[0], addr);
          break;
        }

        // Arithmetic
        case 'add':
        case 'adds': {
          const op1 = this.resolveOperand(args[1]);
          const op2 = this.resolveOperand(args[2]);
          const mask = is32 ? MASK_32 : MASK_64;
          const res = (op1 + op2) & mask;
          this.setReg(args[0], res);
          if (op === 'adds') this.updateFlagsAdd(res, op1, op2, is32);
          break;
        }
        case 'sub':
        case 'subs': {
          const op1 = this.resolveOperand(args[1]);
          const op2 = this.resolveOperand(args[2]);
          const mask = is32 ? MASK_32 : MASK_64;
          const res = (op1 - op2) & mask;
          this.setReg(args[0], res);
          if (op === 'subs') this.updateFlagsSub(res, op1, op2, is32);
          break;
        }
        case 'mul': {
          const op1 = this.resolveOperand(args[1]);
          const op2 = this.resolveOperand(args[2]);
          const mask = is32 ? MASK_32 : MASK_64;
          this.setReg(args[0], (op1 * op2) & mask);
          break;
        }
        case 'sdiv': {
          const op1 = is32 ? BigInt(this.toSigned32(this.resolveOperand(args[1]))) : this.toSigned64(this.resolveOperand(args[1]));
          const op2 = is32 ? BigInt(this.toSigned32(this.resolveOperand(args[2]))) : this.toSigned64(this.resolveOperand(args[2]));
          const mask = is32 ? MASK_32 : MASK_64;
          if (op2 === 0n) this.setReg(args[0], 0n);
          else this.setReg(args[0], (op1 / op2) & mask);
          break;
        }
        case 'udiv': {
          const op1 = this.resolveOperand(args[1]);
          const op2 = this.resolveOperand(args[2]);
          const mask = is32 ? MASK_32 : MASK_64;
          if (op2 === 0n) this.setReg(args[0], 0n);
          else this.setReg(args[0], (op1 / op2) & mask);
          break;
        }
        case 'madd': {
          const op1 = this.resolveOperand(args[1]);
          const op2 = this.resolveOperand(args[2]);
          const op3 = this.resolveOperand(args[3]);
          const mask = is32 ? MASK_32 : MASK_64;
          this.setReg(args[0], ((op1 * op2) + op3) & mask);
          break;
        }
        case 'msub': {
          const op1 = this.resolveOperand(args[1]);
          const op2 = this.resolveOperand(args[2]);
          const op3 = this.resolveOperand(args[3]);
          const mask = is32 ? MASK_32 : MASK_64;
          this.setReg(args[0], (op3 - (op1 * op2)) & mask);
          break;
        }
        case 'neg':
        case 'negs': {
          const val = this.resolveOperand(args[1]);
          const mask = is32 ? MASK_32 : MASK_64;
          const res = (-val) & mask;
          this.setReg(args[0], res);
          if (op === 'negs') this.updateFlagsSub(res, 0n, val, is32);
          break;
        }

        // Compare & Test
        case 'cmp': {
          const op1 = this.resolveOperand(args[0]);
          const op2 = this.resolveOperand(args[1]);
          const res = (op1 - op2) & (is32 ? MASK_32 : MASK_64);
          this.updateFlagsSub(res, op1, op2, is32);
          break;
        }
        case 'cmn': {
          const op1 = this.resolveOperand(args[0]);
          const op2 = this.resolveOperand(args[1]);
          const res = (op1 + op2) & (is32 ? MASK_32 : MASK_64);
          this.updateFlagsAdd(res, op1, op2, is32);
          break;
        }
        case 'tst': {
          const op1 = this.resolveOperand(args[0]);
          const op2 = this.resolveOperand(args[1]);
          const res = (op1 & op2) & (is32 ? MASK_32 : MASK_64);
          this.updateFlagsLogic(res, is32);
          break;
        }

        // Bitwise Logic
        case 'and':
        case 'ands': {
          const op1 = this.resolveOperand(args[1]);
          const op2 = this.resolveOperand(args[2]);
          const mask = is32 ? MASK_32 : MASK_64;
          const res = (op1 & op2) & mask;
          this.setReg(args[0], res);
          if (op === 'ands') this.updateFlagsLogic(res, is32);
          break;
        }
        case 'orr': {
          const op1 = this.resolveOperand(args[1]);
          const op2 = this.resolveOperand(args[2]);
          const mask = is32 ? MASK_32 : MASK_64;
          this.setReg(args[0], (op1 | op2) & mask);
          break;
        }
        case 'eor': {
          const op1 = this.resolveOperand(args[1]);
          const op2 = this.resolveOperand(args[2]);
          const mask = is32 ? MASK_32 : MASK_64;
          this.setReg(args[0], (op1 ^ op2) & mask);
          break;
        }
        case 'bic':
        case 'bics': {
          const op1 = this.resolveOperand(args[1]);
          const op2 = this.resolveOperand(args[2]);
          const mask = is32 ? MASK_32 : MASK_64;
          const res = (op1 & ~op2) & mask;
          this.setReg(args[0], res);
          if (op === 'bics') this.updateFlagsLogic(res, is32);
          break;
        }
        case 'lsl': {
          const op1 = this.resolveOperand(args[1]);
          const shift = Number(this.resolveOperand(args[2]) & 63n);
          const mask = is32 ? MASK_32 : MASK_64;
          this.setReg(args[0], (op1 << BigInt(shift)) & mask);
          break;
        }
        case 'lsr': {
          const op1 = this.resolveOperand(args[1]);
          const shift = Number(this.resolveOperand(args[2]) & 63n);
          this.setReg(args[0], (op1 >> BigInt(shift)));
          break;
        }
        case 'asr': {
          const shift = Number(this.resolveOperand(args[2]) & 63n);
          if (is32) {
            const val = this.toSigned32(this.resolveOperand(args[1]));
            this.setReg(args[0], BigInt(val >> shift) & MASK_32);
          } else {
            const val = this.toSigned64(this.resolveOperand(args[1]));
            this.setReg(args[0], (val >> BigInt(shift)) & MASK_64);
          }
          break;
        }

        // Section 3 Bitfield operations (ubfiz, sbfiz, ubfx, sbfx)
        case 'ubfiz': {
          // ubfiz Xd, Xn, #lsb, #width
          const src = this.resolveOperand(args[1]);
          const lsb = Number(this.parseImmediate(args[2]));
          const width = Number(this.parseImmediate(args[3]));
          const widthMask = (1n << BigInt(width)) - 1n;
          const res = ((src & widthMask) << BigInt(lsb)) & (is32 ? MASK_32 : MASK_64);
          this.setReg(args[0], res);
          break;
        }
        case 'ubfx': {
          // ubfx Xd, Xn, #lsb, #width
          const src = this.resolveOperand(args[1]);
          const lsb = Number(this.parseImmediate(args[2]));
          const width = Number(this.parseImmediate(args[3]));
          const widthMask = (1n << BigInt(width)) - 1n;
          const res = ((src >> BigInt(lsb)) & widthMask) & (is32 ? MASK_32 : MASK_64);
          this.setReg(args[0], res);
          break;
        }

        // Branches & Control Flow
        case 'b': {
          const target = args[0].trim();
          if (this.labels.has(target)) {
            nextPc = this.labels.get(target);
          }
          break;
        }
        case 'bl': {
          const target = args[0].trim();
          // Check if it's a simulated CRT function (printf, puts, exit)
          if (this.handleCrtCall(target)) {
            break;
          }
          if (this.labels.has(target)) {
            this.setReg('lr', nextDefaultPc);
            nextPc = this.labels.get(target);
          }
          break;
        }
        case 'ret': {
          const retReg = args[0] ? args[0].trim() : 'lr';
          nextPc = this.getReg(retReg);
          break;
        }
        case 'cbz': {
          const val = this.resolveOperand(args[0]);
          if (val === 0n) {
            const target = args[1].trim();
            if (this.labels.has(target)) nextPc = this.labels.get(target);
          }
          break;
        }
        case 'cbnz': {
          const val = this.resolveOperand(args[0]);
          if (val !== 0n) {
            const target = args[1].trim();
            if (this.labels.has(target)) nextPc = this.labels.get(target);
          }
          break;
        }

        // Memory: Load & Store
        case 'ldr': {
          const mem = this.parseMemOperand(args[1]);
          let addr = this.getReg(mem.baseReg);
          if (mem.offsetReg) {
            const regVal = this.getReg(mem.offsetReg);
            addr += (regVal << BigInt(mem.regShift || 0));
          } else {
            addr += mem.offset;
          }

          if (is32) {
            const val = this.readWord(addr);
            this.setReg(args[0], val);
          } else {
            const val = this.readQuad(addr);
            this.setReg(args[0], val);
          }

          if (mem.writeback) {
            if (mem.type === 'pre') this.setReg(mem.baseReg, addr);
            else if (mem.type === 'post') this.setReg(mem.baseReg, this.getReg(mem.baseReg) + mem.offset);
          }
          break;
        }
        case 'str': {
          const mem = this.parseMemOperand(args[1]);
          let addr = this.getReg(mem.baseReg);
          if (mem.offsetReg) {
            const regVal = this.getReg(mem.offsetReg);
            addr += (regVal << BigInt(mem.regShift || 0));
          } else {
            addr += mem.offset;
          }

          const val = this.resolveOperand(args[0]);
          if (is32) {
            this.writeWord(addr, val);
          } else {
            this.writeQuad(addr, val);
          }

          if (mem.writeback) {
            if (mem.type === 'pre') this.setReg(mem.baseReg, addr);
            else if (mem.type === 'post') this.setReg(mem.baseReg, this.getReg(mem.baseReg) + mem.offset);
          }
          break;
        }
        case 'ldrb': {
          const mem = this.parseMemOperand(args[1]);
          let addr = this.getReg(mem.baseReg) + mem.offset;
          const val = BigInt(this.readByte(addr));
          this.setReg(args[0], val);
          break;
        }
        case 'strb': {
          const mem = this.parseMemOperand(args[1]);
          let addr = this.getReg(mem.baseReg) + mem.offset;
          const val = Number(this.resolveOperand(args[0]) & 0xFFn);
          this.writeByte(addr, val);
          break;
        }
        case 'ldrh': {
          const mem = this.parseMemOperand(args[1]);
          let addr = this.getReg(mem.baseReg) + mem.offset;
          const val = this.readHalfword(addr);
          this.setReg(args[0], val);
          break;
        }
        case 'strh': {
          const mem = this.parseMemOperand(args[1]);
          let addr = this.getReg(mem.baseReg) + mem.offset;
          const val = this.resolveOperand(args[0]);
          this.writeHalfword(addr, val);
          break;
        }

        // Load / Store Pair (STP / LDP)
        case 'stp': {
          // e.g. stp x29, x30, [sp, -16]!
          const mem = this.parseMemOperand(args[2]);
          let addr = this.getReg(mem.baseReg);
          if (mem.type === 'pre') addr += mem.offset;

          const val1 = this.resolveOperand(args[0]);
          const val2 = this.resolveOperand(args[1]);
          this.writeQuad(addr, val1);
          this.writeQuad(addr + 8n, val2);

          if (mem.writeback) {
            if (mem.type === 'pre') this.setReg(mem.baseReg, addr);
            else if (mem.type === 'post') this.setReg(mem.baseReg, this.getReg(mem.baseReg) + mem.offset);
          }
          break;
        }
        case 'ldp': {
          // e.g. ldp x29, x30, [sp], 16
          const mem = this.parseMemOperand(args[2]);
          let addr = this.getReg(mem.baseReg);
          if (mem.type === 'pre') addr += mem.offset;

          this.setReg(args[0], this.readQuad(addr));
          this.setReg(args[1], this.readQuad(addr + 8n));

          if (mem.writeback) {
            if (mem.type === 'pre') this.setReg(mem.baseReg, addr);
            else if (mem.type === 'post') this.setReg(mem.baseReg, this.getReg(mem.baseReg) + mem.offset);
          }
          break;
        }

        // System Call
        case 'svc': {
          this.handleSyscall();
          break;
        }
        case 'nop': {
          break;
        }

        default: {
          // Check for conditional branch instructions like `b.eq`, `b.ne`, `beq`, `bne`
          let cond = null;
          if (op.startsWith('b.') && op.length > 2) {
            cond = op.substring(2);
          } else if (op.startsWith('b') && op.length > 1) {
            cond = op.substring(1);
          }

          if (cond && this.evalCondition(cond)) {
            const target = args[0].trim();
            if (this.labels.has(target)) {
              nextPc = this.labels.get(target);
            }
          }
          break;
        }
      }
    } catch (err) {
      this.isTerminated = true;
      this.lastError = err.message;
      return { status: 'error', message: `Runtime error at line ${inst.lineIndex + 1}: ${err.message}` };
    }

    this.cycleCount++;
    this.pc = nextPc;

    // Check if next PC is mapped or reached program end
    if (!this.instructions.some(i => i.pc === this.pc)) {
      this.isTerminated = true;
      return { status: 'terminated', message: 'Program reached end of text section' };
    }

    // Check if next instruction is at a breakpoint
    const nextLine = this.pcToLineIndex.get(this.pc);
    if (nextLine !== undefined && this.breakpoints.has(nextLine)) {
      return { status: 'breakpoint', line: nextLine };
    }

    return { status: 'ok', currentLine: this.pcToLineIndex.get(this.pc) };
  }

  // Toggle breakpoint at 0-based source line index
  toggleBreakpoint(lineIndex) {
    if (this.breakpoints.has(lineIndex)) {
      this.breakpoints.delete(lineIndex);
      return false;
    } else {
      this.breakpoints.add(lineIndex);
      return true;
    }
  }

  // Get active line index for UI indicator
  getCurrentLineIndex() {
    return this.pcToLineIndex.get(this.pc) ?? -1;
  }
}
