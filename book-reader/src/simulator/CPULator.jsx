import { useState, useEffect, useRef, useCallback } from 'react';
import { ARM64Simulator } from './arm64Engine';
import { SAMPLE_PROGRAMS } from './samplePrograms';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  StepForward, 
  Cpu, 
  Terminal, 
  Database, 
  Sliders, 
  CheckCircle, 
  Code2, 
  Trash2, 
  Copy, 
  Check 
} from 'lucide-react';

const MASK_64 = 0xFFFFFFFFFFFFFFFFn;
const MASK_32 = 0xFFFFFFFFn;
const SIGN_BIT_64 = 0x8000000000000000n;
const SIGN_BIT_32 = 0x80000000n;

function toSigned64(val) {
  const v = BigInt(val) & MASK_64;
  return (v & SIGN_BIT_64) ? v - 0x10000000000000000n : v;
}

function toSigned32(val) {
  const v = BigInt(val) & MASK_32;
  return (v & SIGN_BIT_32) ? v - 0x100000000n : v;
}

function computeMemoryRows(sim, memBaseAddr) {
  let base;
  try {
    if (memBaseAddr.startsWith('0x') || memBaseAddr.startsWith('0X')) {
      base = BigInt(memBaseAddr);
    } else {
      base = BigInt(parseInt(memBaseAddr, 10));
    }
  } catch {
    base = 0x410000n;
  }

  const rows = [];
  for (let r = 0; r < 8; r++) {
    const rowAddr = base + BigInt(r * 16);
    const hexBytes = [];
    let ascii = '';
    for (let c = 0; c < 16; c++) {
      const byte = sim.readByte(rowAddr + BigInt(c));
      hexBytes.push(byte.toString(16).toUpperCase().padStart(2, '0'));
      ascii += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
    }
    rows.push({
      addr: '0x' + rowAddr.toString(16).toUpperCase().padStart(8, '0'),
      hex1: hexBytes.slice(0, 8).join(' '),
      hex2: hexBytes.slice(8, 16).join(' '),
      ascii
    });
  }
  return rows;
}

export default function CPULator({ 
  initialCode = null, 
  challenge = null,
  onCompleteChallenge = null 
}) {
  const [sourceCode, setSourceCode] = useState(() => initialCode || SAMPLE_PROGRAMS[0].code);
  const [selectedSample, setSelectedSample] = useState(() => initialCode ? 'custom' : SAMPLE_PROGRAMS[0].id);
  const [regMode, setRegMode] = useState('64'); // '64' | '32'
  const [radixMode, setRadixMode] = useState('hex'); // 'hex' | 'dec'
  const [speed, setSpeed] = useState(150); // delay in ms between steps when running
  const [activeTab, setActiveTab] = useState('registers'); // 'registers' | 'memory' | 'console'
  const [memBaseAddr, setMemBaseAddr] = useState('0x410000');
  const [copied, setCopied] = useState(false);

  // Simulator instance in ref
  const simRef = useRef(null);
  if (simRef.current == null) {
    simRef.current = new ARM64Simulator();
  }

  const [simState, setSimState] = useState(() => ({
    isAssembled: false,
    isRunning: false,
    isTerminated: false,
    currentLine: -1,
    pc: 0x400000n,
    sp: 0x7FFFF0n,
    cycles: 0,
    flags: { N: 0, Z: 1, C: 0, V: 0 },
    x: new Array(31).fill(0n),
    changedRegisters: new Set(),
    breakpoints: new Set(),
    stdout: '',
    exitCode: null,
    memoryRows: [],
    statusMessage: 'Ready to assemble',
    error: null,
    testResults: null
  }));

  const runIntervalRef = useRef(null);

  // Sync state from simulator instance
  const syncState = useCallback((extra = {}) => {
    const sim = simRef.current;
    const memRows = computeMemoryRows(sim, memBaseAddr);

    setSimState(prev => ({
      ...prev,
      isAssembled: sim.isAssembled,
      isTerminated: sim.isTerminated,
      currentLine: sim.getCurrentLineIndex(),
      pc: sim.pc,
      sp: sim.sp,
      cycles: sim.cycleCount,
      flags: { ...sim.flags },
      x: [...sim.x],
      changedRegisters: new Set(sim.changedRegisters),
      breakpoints: new Set(sim.breakpoints),
      stdout: sim.stdout,
      exitCode: sim.exitCode,
      memoryRows: memRows,
      ...extra
    }));
  }, [memBaseAddr]);

  // Assemble code
  const handleAssemble = useCallback(() => {
    if (runIntervalRef.current) {
      clearInterval(runIntervalRef.current);
      runIntervalRef.current = null;
    }

    const sim = simRef.current;
    const res = sim.assemble(sourceCode);
    if (res.success) {
      syncState({
        isRunning: false,
        statusMessage: `Assembled ${res.instructionCount} instructions. Entry PC: 0x${res.entryPc.toString(16)}`,
        error: null,
        testResults: null
      });
    } else {
      syncState({
        isRunning: false,
        statusMessage: 'Assembly error',
        error: res.error || 'Failed to assemble'
      });
    }
  }, [sourceCode, syncState]);

  // Assemble on mount
  useEffect(() => {
    handleAssemble();
    return () => {
      if (runIntervalRef.current) clearInterval(runIntervalRef.current);
    };
  }, [handleAssemble]);

  // Re-sync memory when base address changes
  useEffect(() => {
    if (simRef.current && simRef.current.isAssembled) {
      const sim = simRef.current;
      const memRows = computeMemoryRows(sim, memBaseAddr);
      setSimState(prev => ({ ...prev, memoryRows: memRows }));
    }
  }, [memBaseAddr]);

  // Step instruction
  const handleStep = useCallback(() => {
    const sim = simRef.current;
    if (!sim.isAssembled) {
      handleAssemble();
      return;
    }
    if (sim.isTerminated) {
      syncState({ statusMessage: 'Program terminated. Press Reset to restart.' });
      return;
    }

    const result = sim.step();
    if (result.status === 'ok') {
      syncState({ statusMessage: `Executed cycle ${sim.cycleCount}`, isRunning: false });
    } else if (result.status === 'breakpoint') {
      syncState({ statusMessage: `Breakpoint hit at line ${result.line + 1}`, isRunning: false });
    } else if (result.status === 'terminated') {
      syncState({ statusMessage: result.message || 'Execution completed', isRunning: false });
    } else if (result.status === 'error') {
      syncState({ statusMessage: result.message, error: result.message, isRunning: false });
    }
  }, [handleAssemble, syncState]);

  // Run / Continue execution
  const handleRun = () => {
    const sim = simRef.current;
    if (!sim.isAssembled) handleAssemble();
    if (sim.isTerminated) return;

    setSimState(prev => ({ ...prev, isRunning: true, statusMessage: 'Running...' }));

    if (runIntervalRef.current) clearInterval(runIntervalRef.current);

    runIntervalRef.current = setInterval(() => {
      const res = sim.step();
      syncState();

      if (res.status !== 'ok') {
        clearInterval(runIntervalRef.current);
        runIntervalRef.current = null;
        setSimState(prev => ({
          ...prev,
          isRunning: false,
          statusMessage: res.status === 'breakpoint'
            ? `Breakpoint hit at line ${res.line + 1}`
            : (res.message || 'Halted')
        }));
      }
    }, Math.max(10, speed));
  };

  // Pause execution
  const handlePause = () => {
    if (runIntervalRef.current) {
      clearInterval(runIntervalRef.current);
      runIntervalRef.current = null;
    }
    setSimState(prev => ({ ...prev, isRunning: false, statusMessage: 'Paused' }));
  };

  // Reset simulator
  const handleReset = () => {
    if (runIntervalRef.current) {
      clearInterval(runIntervalRef.current);
      runIntervalRef.current = null;
    }
    handleAssemble();
  };

  // Toggle breakpoint on line
  const handleToggleBreakpoint = (lineIdx) => {
    const sim = simRef.current;
    sim.toggleBreakpoint(lineIdx);
    syncState();
  };

  // Verify challenge tests
  const handleVerifyChallenge = () => {
    if (!challenge) return;
    const sim = simRef.current;

    // Run program to completion
    let steps = 0;
    while (!sim.isTerminated && steps < 10000) {
      sim.step();
      steps++;
    }
    syncState();

    const results = challenge.tests.map(test => {
      let passed = false;
      let actual = '';

      if (test.type === 'register') {
        const val = sim.getReg(test.reg);
        actual = test.radix === 'dec' ? sim.toSigned64(val).toString() : `0x${val.toString(16)}`;
        passed = BigInt(val) === BigInt(test.expected);
      } else if (test.type === 'flag') {
        const flagVal = sim.flags[test.flag];
        actual = flagVal.toString();
        passed = flagVal === test.expected;
      } else if (test.type === 'stdout') {
        actual = sim.stdout.trim();
        passed = actual.includes(test.expected.trim());
      }

      return {
        description: test.description,
        passed,
        actual,
        expected: test.expected.toString()
      };
    });

    const allPassed = results.every(r => r.passed);
    setSimState(prev => ({ ...prev, testResults: { passed: allPassed, tests: results } }));

    if (allPassed && onCompleteChallenge) {
      onCompleteChallenge(challenge.id);
    }
  };

  // Format register value display
  const formatReg = (val, is32 = false) => {
    const v = is32 ? (val & 0xFFFFFFFFn) : val;
    if (radixMode === 'hex') {
      const hexStr = v.toString(16).toUpperCase();
      return is32 
        ? '0x' + hexStr.padStart(8, '0')
        : '0x' + hexStr.padStart(16, '0');
    } else {
      const signed = is32 ? toSigned32(v) : toSigned64(v);
      return signed.toString();
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(sourceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="cpulator-container">
      {/* Top Header / Control Toolbar */}
      <div className="cpulator-toolbar">
        <div className="cpulator-toolbar-group">
          <div className="cpulator-brand">
            <Cpu size={20} className="text-cyan-400" />
            <span className="cpulator-title">CPULator ARM64</span>
            <span className="cpulator-badge">AArch64</span>
          </div>

          <div className="cpulator-sample-select-wrapper">
            <select
              value={selectedSample}
              onChange={(e) => {
                const sample = SAMPLE_PROGRAMS.find(p => p.id === e.target.value);
                if (sample) {
                  setSelectedSample(sample.id);
                  setSourceCode(sample.code);
                }
              }}
              className="cpulator-select"
            >
              {selectedSample === 'custom' && <option value="custom">Current Lesson Code</option>}
              {SAMPLE_PROGRAMS.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Playback & Stepping Controls */}
        <div className="cpulator-controls">
          <button 
            onClick={handleAssemble}
            className="cpulator-btn cpulator-btn-secondary"
            title="Assemble & Reset"
          >
            <RotateCcw size={15} />
            <span>Assemble</span>
          </button>

          <button 
            onClick={handleStep}
            disabled={simState.isRunning || simState.isTerminated}
            className="cpulator-btn cpulator-btn-action"
            title="Step Into (F7)"
          >
            <StepForward size={16} />
            <span>Step</span>
          </button>

          {simState.isRunning ? (
            <button 
              onClick={handlePause}
              className="cpulator-btn cpulator-btn-warning"
              title="Pause execution"
            >
              <Pause size={16} />
              <span>Pause</span>
            </button>
          ) : (
            <button 
              onClick={handleRun}
              disabled={simState.isTerminated}
              className="cpulator-btn cpulator-btn-primary"
              title="Run / Continue (F8)"
            >
              <Play size={16} />
              <span>Run</span>
            </button>
          )}

          <button 
            onClick={handleReset}
            className="cpulator-btn cpulator-btn-ghost"
            title="Reset Simulator"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        {/* Speed Slider & Cycle Display */}
        <div className="cpulator-toolbar-group">
          <div className="cpulator-speed-control">
            <Sliders size={14} className="text-slate-400" />
            <input 
              type="range" 
              min="10" 
              max="500" 
              value={speed} 
              onChange={(e) => setSpeed(Number(e.target.value))}
              title={`Delay: ${speed}ms`}
              className="cpulator-slider"
            />
            <span className="cpulator-speed-label">{speed}ms</span>
          </div>

          <div className="cpulator-cycle-badge">
            Cycles: <strong className="text-cyan-300">{simState.cycles}</strong>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className={`cpulator-status-bar ${simState.error ? 'status-error' : ''}`}>
        <div className="status-indicator">
          <span className={`status-dot ${simState.isRunning ? 'dot-running' : simState.isTerminated ? 'dot-terminated' : 'dot-ready'}`} />
          <span className="status-text">{simState.statusMessage}</span>
        </div>

        <div className="status-pc">
          <span>PC: </span>
          <code>0x{simState.pc.toString(16).toUpperCase().padStart(8, '0')}</code>
          <span className="ml-3">SP: </span>
          <code>0x{simState.sp.toString(16).toUpperCase().padStart(8, '0')}</code>
        </div>
      </div>

      {/* Main Workspace Split */}
      <div className="cpulator-workspace">
        {/* Left: Code Editor with Line Numbers & Breakpoints */}
        <div className="cpulator-editor-panel">
          <div className="editor-header">
            <div className="flex items-center gap-2">
              <Code2 size={16} className="text-cyan-400" />
              <span className="text-xs uppercase font-semibold tracking-wider text-slate-300">ARM64 Assembly Source</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleCopyCode}
                className="editor-header-btn"
                title="Copy Code"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button 
                onClick={() => setSourceCode('')}
                className="editor-header-btn"
                title="Clear Editor"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="editor-body">
            <div className="editor-gutter">
              {sourceCode.split('\n').map((_, idx) => {
                const isCurrent = simState.currentLine === idx;
                const isBp = simState.breakpoints.has(idx);
                return (
                  <div 
                    key={idx} 
                    className={`gutter-line ${isCurrent ? 'gutter-current' : ''}`}
                    onClick={() => handleToggleBreakpoint(idx)}
                    title={`Line ${idx + 1} - Click to toggle breakpoint`}
                  >
                    <span className="line-num">{idx + 1}</span>
                    <span className={`bp-dot ${isBp ? 'bp-active' : ''}`} />
                    {isCurrent && <span className="pc-arrow">▶</span>}
                  </div>
                );
              })}
            </div>
            <textarea
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              spellCheck="false"
              className="editor-textarea"
              placeholder="// Type your ARM64 assembly instructions here..."
            />
          </div>

          {/* Challenge Box if active */}
          {challenge && (
            <div className="cpulator-challenge-box">
              <div className="challenge-box-header">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-400" />
                  <strong>Challenge: {challenge.title}</strong>
                </div>
                <button 
                  onClick={handleVerifyChallenge}
                  className="cpulator-btn cpulator-btn-primary text-xs py-1 px-3"
                >
                  Verify Solution
                </button>
              </div>
              <p className="challenge-desc">{challenge.description}</p>
              
              {simState.testResults && (
                <div className={`challenge-test-results ${simState.testResults.passed ? 'tests-pass' : 'tests-fail'}`}>
                  <div className="test-overall-badge">
                    {simState.testResults.passed ? '✓ All Tests Passed!' : '✗ Tests Failed'}
                  </div>
                  <div className="test-list">
                    {simState.testResults.tests.map((t, idx) => (
                      <div key={idx} className={`test-item ${t.passed ? 'item-pass' : 'item-fail'}`}>
                        <span>{t.passed ? '✓' : '✗'} {t.description}</span>
                        {!t.passed && (
                          <span className="test-diff">Expected: {t.expected}, Got: {t.actual}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Inspection Panels (Registers, Memory, Console) */}
        <div className="cpulator-inspector-panel">
          {/* Inspector Tab Selector */}
          <div className="inspector-tabs">
            <button 
              className={`inspector-tab ${activeTab === 'registers' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('registers')}
            >
              <Cpu size={14} />
              <span>Registers & Flags</span>
            </button>
            <button 
              className={`inspector-tab ${activeTab === 'memory' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('memory')}
            >
              <Database size={14} />
              <span>Memory Viewer</span>
            </button>
            <button 
              className={`inspector-tab ${activeTab === 'console' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('console')}
            >
              <Terminal size={14} />
              <span>I/O Console</span>
              {simState.stdout && <span className="tab-pill" />}
            </button>
          </div>

          {/* TAB 1: REGISTERS & FLAGS */}
          {activeTab === 'registers' && (
            <div className="inspector-content">
              {/* PSTATE Condition Flags */}
              <div className="flags-bar">
                <span className="flags-label">NZCV Flags:</span>
                <div className="flags-group">
                  <div className={`flag-badge ${simState.flags.N ? 'flag-on' : ''}`} title="Negative Flag (Sign Bit)">
                    <span className="flag-name">N</span>
                    <span className="flag-val">{simState.flags.N}</span>
                  </div>
                  <div className={`flag-badge ${simState.flags.Z ? 'flag-on' : ''}`} title="Zero Flag (Result was zero)">
                    <span className="flag-name">Z</span>
                    <span className="flag-val">{simState.flags.Z}</span>
                  </div>
                  <div className={`flag-badge ${simState.flags.C ? 'flag-on' : ''}`} title="Carry Flag (Unsigned overflow/borrow)">
                    <span className="flag-name">C</span>
                    <span className="flag-val">{simState.flags.C}</span>
                  </div>
                  <div className={`flag-badge ${simState.flags.V ? 'flag-on' : ''}`} title="Overflow Flag (Signed overflow)">
                    <span className="flag-name">V</span>
                    <span className="flag-val">{simState.flags.V}</span>
                  </div>
                </div>

                {/* View Toggles */}
                <div className="reg-format-toggles">
                  <div className="toggle-pill-group">
                    <button 
                      className={`toggle-pill ${regMode === '64' ? 'pill-active' : ''}`}
                      onClick={() => setRegMode('64')}
                    >
                      X (64-bit)
                    </button>
                    <button 
                      className={`toggle-pill ${regMode === '32' ? 'pill-active' : ''}`}
                      onClick={() => setRegMode('32')}
                    >
                      W (32-bit)
                    </button>
                  </div>
                  <div className="toggle-pill-group">
                    <button 
                      className={`toggle-pill ${radixMode === 'hex' ? 'pill-active' : ''}`}
                      onClick={() => setRadixMode('hex')}
                    >
                      Hex
                    </button>
                    <button 
                      className={`toggle-pill ${radixMode === 'dec' ? 'pill-active' : ''}`}
                      onClick={() => setRadixMode('dec')}
                    >
                      Dec
                    </button>
                  </div>
                </div>
              </div>

              {/* Special Pinned Registers: PC, SP, FP, LR */}
              <div className="special-regs-grid">
                <div className="special-reg-item">
                  <span className="spec-name">PC</span>
                  <span className="spec-val">0x{simState.pc.toString(16).toUpperCase()}</span>
                </div>
                <div className="special-reg-item">
                  <span className="spec-name">SP</span>
                  <span className="spec-val">0x{simState.sp.toString(16).toUpperCase()}</span>
                </div>
                <div className="special-reg-item">
                  <span className="spec-name">FP (X29)</span>
                  <span className="spec-val">0x{simState.x[29].toString(16).toUpperCase()}</span>
                </div>
                <div className="special-reg-item">
                  <span className="spec-name">LR (X30)</span>
                  <span className="spec-val">0x{simState.x[30].toString(16).toUpperCase()}</span>
                </div>
              </div>

              {/* 31 General Purpose Registers Grid */}
              <div className="registers-grid">
                {simState.x.map((val, idx) => {
                  const regName = regMode === '64' ? `X${idx}` : `W${idx}`;
                  const isChanged = simState.changedRegisters.has(`x${idx}`);
                  const formatted = formatReg(val, regMode === '32');
                  return (
                    <div 
                      key={idx} 
                      className={`register-card ${isChanged ? 'reg-changed' : ''}`}
                    >
                      <span className="reg-id">{regName}</span>
                      <span className="reg-val" title={formatted}>{formatted}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: MEMORY VIEWER */}
          {activeTab === 'memory' && (
            <div className="inspector-content">
              <div className="memory-nav-bar">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Address:</span>
                  <input 
                    type="text" 
                    value={memBaseAddr} 
                    onChange={(e) => setMemBaseAddr(e.target.value)}
                    className="memory-addr-input"
                    placeholder="0x410000"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setMemBaseAddr('0x400000')}
                    className="mem-jump-btn"
                  >
                    .text (PC)
                  </button>
                  <button 
                    onClick={() => setMemBaseAddr('0x410000')}
                    className="mem-jump-btn"
                  >
                    .data
                  </button>
                  <button 
                    onClick={() => setMemBaseAddr('0x' + (simState.sp - 32n).toString(16))}
                    className="mem-jump-btn"
                  >
                    Stack (SP)
                  </button>
                </div>
              </div>

              <div className="memory-table-wrapper">
                <table className="memory-table">
                  <thead>
                    <tr>
                      <th>Address</th>
                      <th>+0 .. +7</th>
                      <th>+8 .. +F</th>
                      <th>ASCII</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simState.memoryRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="mem-addr">{row.addr}</td>
                        <td className="mem-hex">{row.hex1}</td>
                        <td className="mem-hex">{row.hex2}</td>
                        <td className="mem-ascii">{row.ascii}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: TERMINAL CONSOLE */}
          {activeTab === 'console' && (
            <div className="inspector-content console-tab-content">
              <div className="console-header">
                <span className="text-xs text-slate-400">Simulation Console (stdout / stderr)</span>
                <button 
                  onClick={() => setSimState(prev => ({ ...prev, stdout: '' }))}
                  className="editor-header-btn text-xs"
                >
                  <Trash2 size={12} />
                  <span>Clear</span>
                </button>
              </div>
              <div className="terminal-display">
                <pre>{simState.stdout || '// Program stdout output will appear here via sys_write (x8=64) or printf...'}</pre>
                {simState.isTerminated && (
                  <div className="terminal-exit-badge">
                    Program exited with return code: {simState.exitCode ?? 0}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
