import React from 'react';
import { Terminal, Folder, Sparkles, Activity, X, ChevronRight, HardDrive, Cpu, Play, DownloadCloud, FileCode, Key } from 'lucide-react';
import { SystemMetrics } from '../types';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTerminal: () => void;
  onOpenFileManager: () => void;
  onOpenAi: () => void;
  onOpenAiSettings?: () => void;
  onOpenProcesses: () => void;
  system: SystemMetrics | null;
  currentCwd: string;
  isExecuting?: boolean;
  activeCommand?: string;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  onOpenTerminal,
  onOpenFileManager,
  onOpenAi,
  onOpenAiSettings,
  onOpenProcesses,
  system,
  currentCwd,
  isExecuting = false,
  activeCommand
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-start animate-in fade-in duration-200">
      <div className="bg-[#0e0e14] border-r border-zinc-800 w-80 max-w-[85vw] h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-200 font-mono text-xs">
        {/* Drawer Header */}
        <div className="p-4 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white shadow-md shadow-red-950/60">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white text-xs block">
                Ubuntu RDP Tools
              </span>
              <span className="text-[10px] text-zinc-400">
                root@{system?.hostname || 'ubuntu'}:~#
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
            title="Close Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Active Process Banner if running */}
        {isExecuting && (
          <div className="bg-sky-950/70 border-b border-sky-800/80 p-3 flex items-center justify-between text-[11px] text-sky-200">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping shrink-0" />
              <span className="truncate font-semibold">Active: {activeCommand || 'Installing / Updating...'}</span>
            </div>
            <button
              onClick={() => {
                onOpenTerminal();
                onClose();
              }}
              className="px-2 py-0.5 rounded bg-sky-800 hover:bg-sky-700 text-white text-[10px] shrink-0 font-bold"
            >
              Logs
            </button>
          </div>
        )}

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="text-[10px] uppercase font-bold text-zinc-500 px-2 pt-1">
            Workspace Menus
          </div>

          {/* Terminal */}
          <button
            onClick={() => {
              onOpenTerminal();
              onClose();
            }}
            className="w-full p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 text-zinc-200 border border-zinc-800/80 flex items-center justify-between transition active:scale-98 text-left"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-red-950/80 text-red-400 border border-red-800/60 flex items-center justify-center">
                <Terminal className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="font-bold text-xs block text-white">Ubuntu Terminal</span>
                <span className="text-[10px] text-zinc-500 truncate max-w-[170px] block">{currentCwd}</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </button>

          {/* File Manager */}
          <button
            onClick={() => {
              onOpenFileManager();
              onClose();
            }}
            className="w-full p-2.5 rounded-xl bg-gradient-to-r from-amber-950/40 to-zinc-900 hover:bg-amber-950/60 text-zinc-200 border border-amber-900/40 flex items-center justify-between transition active:scale-98 text-left"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-950 text-amber-400 border border-amber-800 flex items-center justify-center">
                <Folder className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="font-bold text-xs block text-amber-200">File Manager</span>
                <span className="text-[10px] text-zinc-400">Cut, Copy, Edit, Zip, GitHub</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-500/70" />
          </button>

          {/* AI Copilot */}
          <button
            onClick={() => {
              onOpenAi();
              onClose();
            }}
            className="w-full p-2.5 rounded-xl bg-gradient-to-r from-purple-950/40 to-zinc-900 hover:bg-purple-950/60 text-zinc-200 border border-purple-900/40 flex items-center justify-between transition active:scale-98 text-left"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-purple-950 text-purple-400 border border-purple-800 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="font-bold text-xs block text-purple-200">Gemini AI Copilot</span>
                <span className="text-[10px] text-zinc-400">Commands, error fix & chat</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-purple-500/70" />
          </button>

          {/* Set Gemini API Key */}
          <button
            onClick={() => {
              if (onOpenAiSettings) {
                onOpenAiSettings();
              } else {
                onOpenAi();
              }
              onClose();
            }}
            className="w-full p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 text-zinc-200 border border-zinc-800/80 flex items-center justify-between transition active:scale-98 text-left"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-purple-950/70 text-purple-300 border border-purple-800/60 flex items-center justify-center">
                <Key className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="font-bold text-xs block text-zinc-200">Set Gemini API Key</span>
                <span className="text-[10px] text-zinc-400">Configure free key for deployment</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </button>

          {/* Background Scripts & Tasks */}
          <button
            onClick={() => {
              onOpenProcesses();
              onClose();
            }}
            className="w-full p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 text-zinc-200 border border-zinc-800/80 flex items-center justify-between transition active:scale-98 text-left"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="font-bold text-xs block text-white">Scripts & Tasks</span>
                <span className="text-[10px] text-zinc-400">{system?.activeScriptsCount || 0} active scripts running</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </button>

          {/* Server Resources Info */}
          <div className="pt-3">
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/80 space-y-2">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block">
                Server Resources
              </span>
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span className="flex items-center gap-1.5 text-sky-400">
                  <Cpu className="w-3.5 h-3.5" /> CPU Load
                </span>
                <span>{system?.cpu.load1m || 0}% ({system?.cpu.cores || 1} Cores)</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <HardDrive className="w-3.5 h-3.5" /> Memory RAM
                </span>
                <span>{system?.memory.usedMb || 0} / {system?.memory.totalMb || 0} MB</span>
              </div>
              {system?.disk && (
                <div className="flex items-center justify-between text-[11px] text-zinc-300">
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <DownloadCloud className="w-3.5 h-3.5" /> Disk Free
                  </span>
                  <span>{system.disk.available} / {system.disk.size}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-3 bg-zinc-950 border-t border-zinc-800 text-[10px] text-zinc-500 text-center">
          Ubuntu 22.04 LTS (Jammy) • Mobile Workspace
        </div>
      </div>
    </div>
  );
};
