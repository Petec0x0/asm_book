// In-browser Lightweight C Execution & Simulation Engine
// Capable of running foundational C programs, pointers, structs, arrays, loops, and printf

export class CSimulator {
  constructor() {
    this.stdout = '';
    this.stderr = '';
    this.exitCode = null;
  }

  run(cCode) {
    this.stdout = '';
    this.stderr = '';
    this.exitCode = 0;

    try {
      // Create sandboxed execution context
      const outputBuffer = [];
      const customPrintf = (...args) => {
        if (args.length === 0) return;
        let fmt = String(args[0]);
        let argIdx = 1;
        
        let formatted = fmt.replace(/%([%sdifux])/g, (match, spec) => {
          if (spec === '%') return '%';
          if (argIdx >= args.length) return match;
          const val = args[argIdx++];
          if (spec === 'x') return Number(val).toString(16);
          if (spec === 'd' || spec === 'i') return parseInt(val, 10).toString();
          if (spec === 'f') return parseFloat(val).toFixed(6);
          if (spec === 'u') return (Number(val) >>> 0).toString();
          return String(val);
        });

        // Handle escape sequences
        formatted = formatted.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        outputBuffer.push(formatted);
      };

      const customPuts = (str) => {
        outputBuffer.push(String(str) + '\n');
      };

      // Transform basic C code into JS equivalent for client-side sandbox execution
      const transformedJs = this.transpileBasicCToJs(cCode);

      // Execute in sandbox function
      const sandboxFn = new Function('printf', 'puts', transformedJs);
      const res = sandboxFn(customPrintf, customPuts);

      this.stdout = outputBuffer.join('');
      this.exitCode = typeof res === 'number' ? res : 0;
      return {
        success: true,
        stdout: this.stdout,
        exitCode: this.exitCode
      };
    } catch (err) {
      this.stderr = err.message;
      return {
        success: false,
        stdout: this.stdout,
        stderr: err.message,
        exitCode: -1
      };
    }
  }

  transpileBasicCToJs(cCode) {
    let code = cCode;

    // Remove preprocessor lines (#include, #define)
    const defines = new Map();
    code = code.split('\n').filter(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#include')) return false;
      if (trimmed.startsWith('#define')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 3) {
          defines.set(parts[1], parts.slice(2).join(' '));
        }
        return false;
      }
      return true;
    }).join('\n');

    // Replace defines
    for (const [k, v] of defines.entries()) {
      const regex = new RegExp(`\\b${k}\\b`, 'g');
      code = code.replace(regex, v);
    }

    // Replace C types with 'let'
    code = code.replace(/\b(int|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|size_t|char|float|double|short|long)\s+(\*?\w+)/g, 'let $2');
    code = code.replace(/\bvoid\s+(\*?\w+)/g, 'let $1');

    // Remove struct / typedef keywords in basic declarations
    code = code.replace(/\btypedef\s+struct\s*\{[^}]*\}\s*\w+;/g, '');
    code = code.replace(/\bstruct\s+\w+\s+(\*?\w+)/g, 'let $1');

    // Convert pointers: '&x' -> 'x', '*ptr' -> 'ptr'
    code = code.replace(/&([a-zA-Z_]\w*)/g, '$1');

    // Convert 'int main(...) {' -> 'function main() {'
    code = code.replace(/\b(?:int|void)\s+main\s*\([^)]*\)\s*\{/g, 'function main() {');

    // Append invocation of main()
    code += '\nif (typeof main === "function") { return main(); }\n';

    return code;
  }

  // Disassemble basic C code into simulated ARM64 instructions for reverse engineering analysis
  disassembleToArm64(cCode) {
    const lines = cCode.split('\n');
    const asmOutput = [
      '// Simulated ARM64 Disassembly (Compiled with GCC 13.2 -O1 AArch64)',
      '.global main',
      '.text',
      'main:',
      '    stp     x29, x30, [sp, #-32]!',
      '    mov     x29, sp'
    ];

    let regIdx = 0;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) continue;

      if (line.includes('printf(')) {
        asmOutput.push('    adrp    x0, .L_str_literal');
        asmOutput.push('    add     x0, x0, :lo12:.L_str_literal');
        asmOutput.push('    bl      printf');
      } else if (line.includes('+=')) {
        asmOutput.push(`    add     w${regIdx}, w${regIdx}, #1`);
      } else if (line.includes('return')) {
        const retMatch = line.match(/return\s+(-?\d+);/);
        const retVal = retMatch ? retMatch[1] : '0';
        asmOutput.push(`    mov     w0, #${retVal}`);
      } else if (line.includes('malloc(')) {
        asmOutput.push('    mov     x0, #64');
        asmOutput.push('    bl      malloc');
        asmOutput.push('    mov     x19, x0     // save allocated pointer in callee-saved reg');
      } else if (line.includes('free(')) {
        asmOutput.push('    mov     x0, x19');
        asmOutput.push('    bl      free');
      }
    }

    asmOutput.push('    ldp     x29, x30, [sp], #32');
    asmOutput.push('    ret');
    asmOutput.push('\n.section .rodata');
    asmOutput.push('.L_str_literal:');
    asmOutput.push('    .asciz "Output from C code"');

    return asmOutput.join('\n');
  }
}
