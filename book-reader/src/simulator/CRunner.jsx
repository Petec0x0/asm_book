import { useState, useRef } from 'react';
import { CSimulator } from './cEngine';
import { Play, RotateCcw, Cpu, Terminal, Copy, Check, Trash2, ArrowRight } from 'lucide-react';

const C_SAMPLES = [
  {
    id: 'c_hello',
    title: 'Hello World & Variables',
    code: `#include <stdio.h>

int main(void) {
    int score = 1337;
    printf("Welcome to C Systems Programming!\\n");
    printf("Initial score: %d\\n", score);
    return 0;
}
`
  },
  {
    id: 'c_pointers',
    title: 'Pointers & Memory Addresses',
    code: `#include <stdio.h>

int main(void) {
    int val = 42;
    int *ptr = &val;

    printf("Value of val: %d\\n", val);
    printf("Dereferenced *ptr: %d\\n", *ptr);

    // Modify through pointer
    *ptr = 100;
    printf("Modified val: %d\\n", val);
    return 0;
}
`
  },
  {
    id: 'c_endianness',
    title: 'Endianness Byte Dump',
    code: `#include <stdio.h>

int main(void) {
    unsigned int num = 0x12345678;
    printf("32-bit Integer: 0x%08X\\n", num);
    printf("Byte layout in Little-Endian memory:\\n");
    printf("Byte 0: 0x78 (LSB)\\n");
    printf("Byte 1: 0x56\\n");
    printf("Byte 2: 0x34\\n");
    printf("Byte 3: 0x12 (MSB)\\n");
    return 0;
}
`
  },
  {
    id: 'c_bitwise',
    title: 'Bitwise Flags & Masking',
    code: `#include <stdio.h>

#define FLAG_READ    (1 << 0) // 1
#define FLAG_WRITE   (1 << 1) // 2
#define FLAG_EXECUTE (1 << 2) // 4

int main(void) {
    int permissions = 0;
    permissions |= (FLAG_READ | FLAG_WRITE);

    printf("Permissions value: %d\\n", permissions);
    if (permissions & FLAG_WRITE) {
        printf("Write permission is ACTIVE\\n");
    }
    if (!(permissions & FLAG_EXECUTE)) {
        printf("Execute permission is DISABLED\\n");
    }
    return 0;
}
`
  }
];

export default function CRunner({ 
  initialCode = null, 
  onLoadAsmInCpulator = null 
}) {
  const [cCode, setCCode] = useState(initialCode || C_SAMPLES[0].code);
  const [selectedSample, setSelectedSample] = useState(initialCode ? 'custom' : C_SAMPLES[0].id);
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [disasm, setDisasm] = useState('');
  const [showDisasm, setShowDisasm] = useState(false);
  const [copied, setCopied] = useState(false);

  const engineRef = useRef(new CSimulator());

  const handleRun = () => {
    const engine = engineRef.current;
    const res = engine.run(cCode);
    setStdout(res.stdout);
    setStderr(res.stderr || '');
  };

  const handleDisassemble = () => {
    const engine = engineRef.current;
    const asm = engine.disassembleToArm64(cCode);
    setDisasm(asm);
    setShowDisasm(true);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(cCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="c-runner-container">
      {/* Top Toolbar */}
      <div className="cpulator-toolbar">
        <div className="cpulator-toolbar-group">
          <div className="cpulator-brand">
            <span className="font-bold text-amber-400">C</span>
            <span className="cpulator-title">C Systems Sandbox</span>
          </div>

          <select
            value={selectedSample}
            onChange={(e) => {
              const s = C_SAMPLES.find(x => x.id === e.target.value);
              if (s) {
                setSelectedSample(s.id);
                setCCode(s.code);
              }
            }}
            className="cpulator-select"
          >
            {selectedSample === 'custom' && <option value="custom">Current Lesson Code</option>}
            {C_SAMPLES.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>

        <div className="cpulator-controls">
          <button 
            onClick={handleRun}
            className="cpulator-btn cpulator-btn-primary"
            title="Compile & Run C Code"
          >
            <Play size={16} />
            <span>Run C Code</span>
          </button>

          <button 
            onClick={handleDisassemble}
            className="cpulator-btn cpulator-btn-secondary"
            title="Disassemble to ARM64"
          >
            <Cpu size={15} />
            <span>Disassemble to ARM64</span>
          </button>

          <button 
            onClick={() => {
              setStdout('');
              setStderr('');
            }}
            className="cpulator-btn cpulator-btn-ghost"
            title="Reset Terminal"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* Editor & Output Split */}
      <div className="cpulator-workspace">
        <div className="cpulator-editor-panel">
          <div className="editor-header">
            <span className="text-xs uppercase font-semibold text-slate-300">C Source Code</span>
            <div className="flex items-center gap-2">
              <button onClick={handleCopyCode} className="editor-header-btn">
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button onClick={() => setCCode('')} className="editor-header-btn">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="editor-body">
            <textarea
              value={cCode}
              onChange={(e) => setCCode(e.target.value)}
              spellCheck="false"
              className="editor-textarea"
              placeholder="// Write your C program here..."
            />
          </div>
        </div>

        {/* Output Panel / Disassembly Panel */}
        <div className="cpulator-inspector-panel">
          <div className="inspector-tabs">
            <button 
              className={`inspector-tab ${!showDisasm ? 'tab-active' : ''}`}
              onClick={() => setShowDisasm(false)}
            >
              <Terminal size={14} />
              <span>Program Output</span>
            </button>
            <button 
              className={`inspector-tab ${showDisasm ? 'tab-active' : ''}`}
              onClick={() => setShowDisasm(true)}
            >
              <Cpu size={14} />
              <span>ARM64 Disassembly</span>
            </button>
          </div>

          <div className="inspector-content console-tab-content">
            {!showDisasm ? (
              <div className="terminal-display">
                <pre>{stdout || (stderr ? `[Compilation Error]: ${stderr}` : '// Click "Run C Code" to execute...')}</pre>
              </div>
            ) : (
              <div className="terminal-display">
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-700">
                  <span className="text-xs text-cyan-400 font-mono">GCC 13.2 Disassembly</span>
                  {onLoadAsmInCpulator && (
                    <button 
                      onClick={() => onLoadAsmInCpulator(disasm)}
                      className="cpulator-btn cpulator-btn-action text-xs py-1"
                    >
                      <span>Open in CPULator</span>
                      <ArrowRight size={12} />
                    </button>
                  )}
                </div>
                <pre>{disasm || '// Click "Disassemble to ARM64" to view compiler assembly...'}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
