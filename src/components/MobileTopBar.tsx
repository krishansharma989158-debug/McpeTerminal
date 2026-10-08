import React from 'react';
import { Terminal, Sparkles, Activity, Trash2, Cpu, HardDrive, Folder, Menu, MoreVertical } from 'lucide-react';
import { SystemMetrics } from '../types';

interface MobileTopBarProps {
  system: SystemMetrics | null;
  onOpenAi: () => void;
  onOpenProcesses: () => void;
  onOpenFileFolder: () => void;
  onOpenDrawer: () => void;
  onClearTerminal: () => void;
  currentCwd: string;
  isExecuting?: boolean;
}

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  system,
  onOpenAi,
  onOpenProcesses,
  onOpenFileFolder,
  onOpenDrawer,
  onClearTerminal,
  currentCwd,
  isExecuting = false
}) => {
  const shortCwd = currentCwd === '/root' ? '~' : currentCwd.replace(/^\/root/, '~');

  return (
    <header className="bg-zinc-950 border-b border-zinc-800 px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sticky top-0 z-30 flex items-center justify-between gap-1.5 shadow-md shrink-0">
      {/* Left: Menu/Drawer Toggle & Prompt */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Drawer 'More' hamburger button */}
        <button
          onClick={onOpenDrawer}
          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-zinc-300 hover:text-white border border-zinc-800 transition flex items-center justify-center shrink-0"
          title="Open Drawer Menu (Files, Scripts, AI, Tools)"
          aria-label="Open Navigation Drawer"
        >
          <Menu className="w-4 h-4 text-amber-400" />
        </button>

        {/* Terminal Host Logo */}
        <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center text-white shadow-md shadow-red-950/60 shrink-0">
          <Terminal className="w-3.5 h-3.5" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1 font-mono text-[11px] sm:text-xs font-bold text-white truncate">
            <span className="text-red-400">root@ubuntu</span>
            <span className="text-zinc-500">:</span>
            <span className="text-amber-300 truncate max-w-[90px] sm:max-w-[140px]" title={currentCwd}>{shortCwd}</span>
            <span className="text-zinc-500">#</span>
            {isExecuting && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-950/90 text-amber-300 border border-amber-700/80 text-[8px] animate-pulse shrink-0">
                <span className="w-1 h-1 rounded-full bg-amber-400" />
                <span>Running</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono text-zinc-400">
            {system ? (
              <>
                <span className="flex items-center gap-0.5 text-sky-400">
                  <Cpu className="w-2.5 h-2.5" />
                  {system.cpu.load1m}%
                </span>
                <span className="text-zinc-700">|</span>
                <span className="flex items-center gap-0.5 text-emerald-400">
                  <HardDrive className="w-2.5 h-2.5" />
                  {system.memory.percent}%
                </span>
              </>
            ) : (
              <span className="text-zinc-500">Ubuntu 22.04 LTS</span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Quick Action Buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* File Manager Quick Button */}
        <button
          onClick={onOpenFileFolder}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-800 font-mono text-[11px] font-semibold transition active:scale-95"
          title="Open File Manager (Cut, Copy, Edit, Zip, GitHub)"
        >
          <Folder className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden xs:inline">Files</span>
        </button>

        {/* AI Assistant Button */}
        <button
          onClick={onOpenAi}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 via-indigo-600 to-sky-600 hover:opacity-90 text-white font-mono text-[11px] font-bold shadow-md shadow-indigo-950/40 transition active:scale-95"
          title="Open Gemini AI Assistant"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">AI</span>
        </button>

        {/* Background Tasks & Scripts Button */}
        <button
          onClick={onOpenProcesses}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-mono text-[11px] transition active:scale-95"
          title="View Background Scripts & Running Processes"
        >
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Tasks</span>
          {Boolean(system?.activeScriptsCount && system.activeScriptsCount > 0) && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
              {system?.activeScriptsCount}
            </span>
          )}
        </button>

        {/* Clear Terminal Screen Button */}
        <button
          onClick={onClearTerminal}
          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition active:scale-95"
          title="Clear Terminal Screen"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* More Drawer Button */}
        <button
          onClick={onOpenDrawer}
          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition active:scale-95"
          title="More Options Drawer"
        >
          <MoreVertical className="w-3.5 h-3.5 text-zinc-300" />
        </button>
      </div>
    </header>
  );
};
