import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, X, Search, FileCode, Play, AlertTriangle, ShieldAlert, Cpu, HardDrive, Terminal, Info, Copy, Check } from 'lucide-react';
import { ProcessItem, SystemMetrics } from '../types';

interface ProcessViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  system: SystemMetrics | null;
  onRefreshSystem: () => void;
  onExecuteCommand?: (command: string) => void;
}

interface InspectDetails {
  pid: number;
  cwd: string;
  cmdline: string;
  state: string;
  vmRSS: string;
  threads: string;
  user: string;
}

export const ProcessViewerModal: React.FC<ProcessViewerModalProps> = ({
  isOpen,
  onClose,
  system,
  onRefreshSystem,
  onExecuteCommand
}) => {
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'scripts' | 'java' | 'packages'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedPidToKill, setSelectedPidToKill] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Deep inspect state
  const [inspectModal, setInspectModal] = useState<InspectDetails | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [copiedInspect, setCopiedInspect] = useState(false);

  const fetchProcesses = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system/processes');
      if (res.ok) {
        const data = await res.json();
        setProcesses(data.processes || []);
      }
    } catch (e) {
      console.warn('Could not fetch processes:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProcesses();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKill = async (pid: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM') => {
    try {
      const res = await fetch('/api/system/process/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid, signal })
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(`Process PID ${pid} terminated`);
        setSelectedPidToKill(null);
        if (inspectModal?.pid === pid) setInspectModal(null);
        await fetchProcesses();
        onRefreshSystem();
      } else {
        setActionMessage(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    }
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleInspectProcess = async (pid: number) => {
    setInspectLoading(true);
    try {
      const res = await fetch(`/api/system/process-inspect/${pid}`);
      if (res.ok) {
        const data = await res.json();
        setInspectModal(data);
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setInspectLoading(false);
    }
  };

  // Filter processes
  const scriptProcesses = processes.filter(p => p.isScript);
  const javaProcesses = processes.filter(p => p.command.toLowerCase().includes('java') || p.comm === 'java');
  const packageProcesses = processes.filter(p => p.scriptType === 'package' || /apt|dpkg|npm|pip/i.test(p.comm));

  const filtered = processes.filter(p => {
    // Category check
    if (categoryFilter === 'scripts' && !p.isScript) return false;
    if (categoryFilter === 'java' && !(p.command.toLowerCase().includes('java') || p.comm === 'java')) return false;
    if (categoryFilter === 'packages' && !(p.scriptType === 'package' || /apt|dpkg|npm|pip/i.test(p.comm))) return false;

    // Search query check
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.command.toLowerCase().includes(q) ||
      p.comm.toLowerCase().includes(q) ||
      p.user.toLowerCase().includes(q) ||
      p.pid.toString().includes(q) ||
      (p.scriptName && p.scriptName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#0e0e14] border-t sm:border border-zinc-800 rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[92dvh] h-[88dvh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-5">
        {/* Header */}
        <div className="bg-[#14141c] p-3.5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-md">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <span className="font-mono text-xs font-bold text-white block">
                Background Scripts & Processes
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">
                {scriptProcesses.length} scripts running • Total {processes.length} tasks
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                fetchProcesses();
                onRefreshSystem();
              }}
              disabled={loading}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Tabs (Scripts, All, Java, Packages) */}
        <div className="bg-zinc-950 p-2 border-b border-zinc-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar font-mono text-[11px] select-none">
          <button
            onClick={() => setCategoryFilter('scripts')}
            className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1 whitespace-nowrap transition ${
              categoryFilter === 'scripts'
                ? 'bg-amber-600 text-zinc-950 shadow-sm'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Scripts ({scriptProcesses.length})</span>
          </button>

          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition ${
              categoryFilter === 'all'
                ? 'bg-zinc-700 text-white font-bold'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <span>All Tasks ({processes.length})</span>
          </button>

          <button
            onClick={() => setCategoryFilter('java')}
            className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition ${
              categoryFilter === 'java'
                ? 'bg-purple-600 text-white font-bold'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <span>☕ Java ({javaProcesses.length})</span>
          </button>

          <button
            onClick={() => setCategoryFilter('packages')}
            className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition ${
              categoryFilter === 'packages'
                ? 'bg-sky-600 text-white font-bold'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <span>📦 Installs ({packageProcesses.length})</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-2.5 bg-zinc-950 border-b border-zinc-800 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search script name (start.sh, python, node, pid)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-zinc-500 hover:text-white px-1 font-mono"
            >
              Clear
            </button>
          )}
        </div>

        {/* Action notification */}
        {actionMessage && (
          <div className="bg-zinc-900 border-b border-zinc-800 px-3 py-1.5 text-[11px] font-mono text-emerald-300 flex items-center justify-between">
            <span>{actionMessage}</span>
            <button onClick={() => setActionMessage(null)} className="text-zinc-500">✕</button>
          </div>
        )}

        {/* Process list */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-900 font-mono text-xs">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 italic">
              {loading ? 'Scanning processes...' : 'No matching scripts or processes found.'}
            </div>
          ) : (
            filtered.map((proc) => {
              const isShellScript = proc.scriptType === 'shell' || proc.command.includes('.sh');
              const isPython = proc.scriptType === 'python';
              const isNode = proc.scriptType === 'node';
              const isJava = proc.scriptType === 'java';

              return (
                <div key={proc.pid} className="p-2.5 hover:bg-zinc-900/60 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-zinc-100 text-xs">
                        PID {proc.pid}
                      </span>

                      {/* Script Type Badge */}
                      {isShellScript && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                          📜 Bash Script ({proc.scriptName || '.sh'})
                        </span>
                      )}
                      {isPython && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800 font-bold">
                          🐍 Python ({proc.scriptName || '.py'})
                        </span>
                      )}
                      {isNode && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                          ⚡ Node.js ({proc.scriptName || '.js'})
                        </span>
                      )}
                      {isJava && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800 font-bold">
                          ☕ Java ({proc.scriptName || '.jar'})
                        </span>
                      )}

                      <span className="text-[10px] text-zinc-500">
                        by {proc.user}
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-200 truncate mt-1 font-mono font-medium" title={proc.command}>
                      {proc.command}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                      <span className={proc.cpu > 5 ? 'text-amber-400 font-bold' : ''}>CPU: {proc.cpu}%</span>
                      <span>•</span>
                      <span>RAM: {proc.mem}% ({proc.rssMb}MB)</span>
                      <span>•</span>
                      <span>Uptime: {proc.time}</span>
                    </div>
                  </div>

                  {/* Actions: Inspect & Kill */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleInspectProcess(proc.pid)}
                      className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-[10px]"
                      title="Inspect details & working directory"
                    >
                      Inspect
                    </button>

                    {proc.pid > 1 && (
                      <button
                        onClick={() => setSelectedPidToKill(proc.pid)}
                        className="px-2 py-1 rounded bg-zinc-900 hover:bg-rose-950 text-rose-400 border border-zinc-800 hover:border-rose-800 text-[10px]"
                        title="Kill Script/Process"
                      >
                        Kill
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Deep Inspect Modal Sheet */}
        {inspectModal && (
          <div className="p-3 bg-zinc-950 border-t border-zinc-800 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-amber-400 font-bold flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Inspect PID {inspectModal.pid}
              </span>
              <button onClick={() => setInspectModal(null)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            <div className="bg-black/80 border border-zinc-800 p-2 rounded text-[11px] space-y-1">
              <div><strong className="text-zinc-400">Working Directory:</strong> <span className="text-emerald-400">{inspectModal.cwd || 'N/A'}</span></div>
              <div className="truncate"><strong className="text-zinc-400">Command:</strong> <span className="text-zinc-200">{inspectModal.cmdline || 'N/A'}</span></div>
              <div><strong className="text-zinc-400">State:</strong> {inspectModal.state} • <strong className="text-zinc-400">Threads:</strong> {inspectModal.threads}</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inspectModal.cmdline || '');
                  setCopiedInspect(true);
                  setTimeout(() => setCopiedInspect(false), 2000);
                }}
                className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 text-[11px] flex items-center gap-1"
              >
                {copiedInspect ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>Copy Command</span>
              </button>
              <button
                onClick={() => handleKill(inspectModal.pid, 'SIGTERM')}
                className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px]"
              >
                Terminate Script
              </button>
            </div>
          </div>
        )}

        {/* Kill Confirm Prompt */}
        {selectedPidToKill && !inspectModal && (
          <div className="p-3 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between gap-2 font-mono text-xs">
            <span className="text-rose-400 font-bold text-[11px]">
              Kill PID {selectedPidToKill}?
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSelectedPidToKill(null)}
                className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-400 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleKill(selectedPidToKill, 'SIGTERM')}
                className="px-2.5 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs"
              >
                SIGTERM
              </button>
              <button
                onClick={() => handleKill(selectedPidToKill, 'SIGKILL')}
                className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
              >
                Force -9
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
