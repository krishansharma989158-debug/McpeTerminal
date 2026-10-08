import React, { useState, useRef, useEffect } from 'react';
import { Send, CornerDownLeft, Sparkles, Copy, Check, AlertTriangle, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, X } from 'lucide-react';
import { TerminalHistoryItem } from '../types';

interface MobileTerminalViewProps {
  history: TerminalHistoryItem[];
  currentCwd: string;
  isExecuting: boolean;
  onExecute: (command: string) => Promise<void>;
  onInterrupt: () => void;
  onClear: () => void;
  onRequestFixError: (command: string, errorOutput: string) => void;
  onOpenAiWithPrompt?: (prompt: string) => void;
}

export const MobileTerminalView: React.FC<MobileTerminalViewProps> = ({
  history,
  currentCwd,
  isExecuting,
  onExecute,
  onInterrupt,
  onClear,
  onRequestFixError,
  onOpenAiWithPrompt
}) => {
  const [inputVal, setInputVal] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isCtrlActive, setIsCtrlActive] = useState(false);
  const [isAltActive, setIsAltActive] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Live timer for ongoing installation or update
  useEffect(() => {
    let timer: any = null;
    if (isExecuting) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds(s => s + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isExecuting]);

  // Command history list for up/down navigation
  const commandList = history.map(h => h.command).filter(c => c !== '^C');

  // Auto-scroll to bottom on new history
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isExecuting]);

  // Handle Form Submit
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cmd = inputVal.trim();
    if (!cmd || isExecuting) return;

    onExecute(cmd);
    setInputVal('');
    setHistoryIndex(-1);
    setIsCtrlActive(false);
    setIsAltActive(false);
    inputRef.current?.focus();
  };

  // Keyboard navigation inside input field
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleHistoryUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleHistoryDown();
    } else if (e.key === 'c' && (e.ctrlKey || isCtrlActive)) {
      e.preventDefault();
      handleCtrlC();
    } else if (e.key === 'l' && (e.ctrlKey || isCtrlActive)) {
      e.preventDefault();
      onClear();
      setIsCtrlActive(false);
    }
  };

  // Virtual Key Handlers
  const handleHistoryUp = () => {
    if (commandList.length === 0) return;
    const nextIndex = historyIndex === -1 ? commandList.length - 1 : Math.max(0, historyIndex - 1);
    setHistoryIndex(nextIndex);
    setInputVal(commandList[nextIndex]);
  };

  const handleHistoryDown = () => {
    if (historyIndex === -1) return;
    const nextIndex = historyIndex + 1;
    if (nextIndex >= commandList.length) {
      setHistoryIndex(-1);
      setInputVal('');
    } else {
      setHistoryIndex(nextIndex);
      setInputVal(commandList[nextIndex]);
    }
  };

  const handleCtrlC = () => {
    if (inputVal) {
      setInputVal('');
    }
    onInterrupt();
    setIsCtrlActive(false);
    inputRef.current?.focus();
  };

  const insertCharacter = (char: string) => {
    const input = inputRef.current;
    if (!input) {
      setInputVal(prev => prev + char);
      return;
    }
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const newVal = inputVal.substring(0, start) + char + inputVal.substring(end);
    setInputVal(newVal);
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + char.length, start + char.length);
    }, 10);
  };

  const handleTabKey = () => {
    // If input ends with space or empty, list files, otherwise append slash or space
    if (!inputVal.trim()) {
      onExecute('ls');
    } else {
      insertCharacter(' ');
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick Chips
  const quickCommands = [
    'ls -la',
    'pwd',
    'cd ..',
    'ps aux | grep -E "\\.sh|\\.py|\\.js|node|python" | grep -v grep',
    'free -h',
    'df -h',
    'top -b -n 1 | head -n 15',
    'ps aux | head -n 12',
    'uptime',
    'uname -a'
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#09090d] text-zinc-200 select-text font-mono text-xs overflow-hidden">
      {/* Terminal Output Stream Area */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 font-mono text-[11px] sm:text-xs">
        {/* Welcome Message */}
        <div className="text-zinc-500 pb-2 border-b border-zinc-900 leading-relaxed">
          <span className="text-red-400 font-bold">Ubuntu 22.04 LTS (Jammy)</span> Mobile Terminal
          <br />
          Type commands directly or tap virtual keys (<span className="text-amber-400">CTRL</span>, <span className="text-amber-400">ESC</span>, <span className="text-amber-400">TAB</span>).
          Use <span className="text-purple-400 font-semibold">AI Help</span> to ask commands or fix errors.
        </div>

        {/* History items */}
        {history.map((item) => {
          const isItemRunning = item.exitCode === null;
          const hasError = !isItemRunning && (item.exitCode !== 0 || !!item.error);
          const isInstallCommand = /^(sudo\s+)?(apt|apt-get|dpkg|npm|pip|pip3|yarn|cargo|git\s+clone|curl|wget|docker|make)/i.test(item.command);

          return (
            <div key={item.id} className="space-y-1">
              {/* Prompt and Command */}
              <div className="flex items-start justify-between gap-2 text-zinc-300">
                <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
                  <span className="text-red-400 font-bold select-none shrink-0">
                    root@ubuntu:{item.cwd}#
                  </span>
                  <span className="text-white font-semibold break-all">{item.command}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 select-none">
                  <span className="text-[10px] text-zinc-600">
                    {isItemRunning ? `${elapsedSeconds}s` : `${item.durationMs}ms`}
                  </span>
                  <button
                    onClick={() => handleCopy(item.command, `cmd-${item.id}`)}
                    className="p-1 hover:text-white text-zinc-600"
                    title="Copy command"
                  >
                    {copiedId === `cmd-${item.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Live Installing / Updating Badge */}
              {isItemRunning && isInstallCommand && (
                <div className="flex items-center justify-between bg-sky-950/60 border border-sky-800/80 rounded px-2.5 py-1 text-[10px] text-sky-200 font-bold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                    <span>📦 Process Logs Active: {item.command}</span>
                  </span>
                  <span className="text-sky-300 font-mono">{elapsedSeconds}s</span>
                </div>
              )}

              {/* Stdout Output (Real-Time Live Stream) */}
              {(item.output || isItemRunning) && (
                <pre className="text-zinc-200 bg-zinc-950/80 p-2 rounded border border-zinc-900/90 whitespace-pre-wrap break-all leading-relaxed overflow-x-auto">
                  {item.output}
                  {isItemRunning && (
                    <span className="inline-block w-2 h-3.5 bg-emerald-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </pre>
              )}

              {/* Stderr Error Output */}
              {item.error && (
                <div className="space-y-1.5">
                  <pre className="text-rose-400 bg-rose-950/20 p-2 rounded border border-rose-900/40 whitespace-pre-wrap break-all leading-relaxed">
                    {item.error}
                    {isItemRunning && (
                      <span className="inline-block w-2 h-3.5 bg-rose-400 animate-pulse ml-0.5 align-middle" />
                    )}
                  </pre>

                  {/* 1-Tap "Fix with AI" Button */}
                  {!isItemRunning && (
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        onClick={() => onRequestFixError(item.command, item.error || '')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-mono text-[10px] font-bold shadow-sm transition active:scale-95"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>✨ Fix Error with Gemini AI</span>
                      </button>
                      <span className="text-[10px] text-zinc-500">Exit code: {item.exitCode}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Live Running Banner with elapsed timer & Stop button */}
        {isExecuting && (
          <div className="sticky bottom-1 z-10 bg-zinc-950/95 border border-zinc-800 p-2 rounded-lg flex items-center justify-between gap-2 shadow-xl backdrop-blur">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <span className="text-[11px] font-bold text-zinc-200 truncate">
                Running: {history[history.length - 1]?.command || 'Active command'}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 text-amber-300 border border-zinc-800 shrink-0 font-mono">
                {elapsedSeconds}s
              </span>
            </div>
            <button
              type="button"
              onClick={handleCtrlC}
              className="px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[10px] font-bold flex items-center gap-1 active:scale-95 shrink-0"
              title="Stop process (Ctrl+C)"
            >
              <span>Stop ^C</span>
            </button>
          </div>
        )}

        <div ref={terminalEndRef} />
      </div>

      {/* Quick Command Chips Carousel */}
      <div className="bg-zinc-950 border-t border-zinc-900 px-2 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 select-none">
        {quickCommands.map((cmd, i) => (
          <button
            key={i}
            onClick={() => {
              setInputVal(cmd);
              inputRef.current?.focus();
            }}
            className="text-[10px] font-mono whitespace-nowrap px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition active:scale-95"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* Virtual Accessory Key Row (Ctrl, Alt, Esc, Tab, Arrows, Pipe, Slash, etc.) */}
      <div className="bg-[#101016] border-t border-zinc-800 px-2 py-1.5 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar shrink-0 select-none">
        {/* CTRL key */}
        <button
          type="button"
          onClick={() => setIsCtrlActive(!isCtrlActive)}
          className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono transition shrink-0 ${
            isCtrlActive
              ? 'bg-amber-500 text-zinc-950 ring-1 ring-amber-300'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
          }`}
          title="Toggle Control Key"
        >
          CTRL
        </button>

        {/* ALT key */}
        <button
          type="button"
          onClick={() => setIsAltActive(!isAltActive)}
          className={`px-2 py-1 rounded text-[11px] font-bold font-mono transition shrink-0 ${
            isAltActive
              ? 'bg-amber-500 text-zinc-950 ring-1 ring-amber-300'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
          }`}
          title="Toggle Alt Key"
        >
          ALT
        </button>

        {/* ESC key */}
        <button
          type="button"
          onClick={() => {
            setInputVal('');
            setIsCtrlActive(false);
          }}
          className="px-2 py-1 rounded text-[11px] font-bold font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition shrink-0"
          title="Escape / Clear line"
        >
          ESC
        </button>

        {/* TAB key */}
        <button
          type="button"
          onClick={handleTabKey}
          className="px-2 py-1 rounded text-[11px] font-bold font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition shrink-0"
          title="Tab Complete"
        >
          TAB
        </button>

        {/* Ctrl+C (Interrupt) */}
        <button
          type="button"
          onClick={handleCtrlC}
          className="px-2 py-1 rounded text-[11px] font-bold font-mono bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 transition shrink-0"
          title="Interrupt (SIGINT / Ctrl+C)"
        >
          ^C
        </button>

        {/* Up arrow (History prev) */}
        <button
          type="button"
          onClick={handleHistoryUp}
          className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition shrink-0"
          title="Previous Command"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>

        {/* Down arrow (History next) */}
        <button
          type="button"
          onClick={handleHistoryDown}
          className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition shrink-0"
          title="Next Command"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>

        {/* Common Linux Shell Symbols */}
        <button
          type="button"
          onClick={() => insertCharacter('|')}
          className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition shrink-0"
          title="Pipe"
        >
          |
        </button>

        <button
          type="button"
          onClick={() => insertCharacter('/')}
          className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition shrink-0"
          title="Slash"
        >
          /
        </button>

        <button
          type="button"
          onClick={() => insertCharacter('~')}
          className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition shrink-0"
          title="Home Tilde"
        >
          ~
        </button>

        <button
          type="button"
          onClick={() => insertCharacter('-')}
          className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition shrink-0"
          title="Dash"
        >
          -
        </button>

        <button
          type="button"
          onClick={() => insertCharacter('_')}
          className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition shrink-0"
          title="Underscore"
        >
          _
        </button>

        <button
          type="button"
          onClick={() => insertCharacter('&')}
          className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition shrink-0"
          title="Background Ampersand"
        >
          &
        </button>

        {/* Clear screen Ctrl+L */}
        <button
          type="button"
          onClick={onClear}
          className="px-2 py-1 rounded text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 transition shrink-0"
          title="Clear Screen (Ctrl+L)"
        >
          ^L
        </button>
      </div>

      {/* Terminal Input Bar */}
      <form onSubmit={handleSubmit} className="p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-zinc-950 border-t border-zinc-800 flex items-center gap-1.5 shrink-0">
        <div className="text-red-500 font-bold select-none text-xs pl-1">
          $
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          placeholder={isCtrlActive ? 'CTRL mode active (e.g., tap c or l)...' : 'Type command (e.g. ps aux, ls, curl)...'}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
        />

        {inputVal && (
          <button
            type="button"
            onClick={() => setInputVal('')}
            className="p-1.5 text-zinc-500 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="submit"
          disabled={isExecuting || !inputVal.trim()}
          className="flex items-center justify-center p-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-mono text-xs font-bold transition shadow-md shadow-red-950/50"
          title="Execute"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
