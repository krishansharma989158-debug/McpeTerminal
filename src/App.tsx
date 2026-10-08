import React, { useState, useEffect, useCallback } from 'react';
import { MobileTopBar } from './components/MobileTopBar';
import { MobileTerminalView } from './components/MobileTerminalView';
import { NavigationDrawer } from './components/NavigationDrawer';
import { FileManagerModal } from './components/FileManagerModal';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';
import { ProcessViewerModal } from './components/ProcessViewerModal';
import { TerminalHistoryItem, SystemMetrics } from './types';

export default function App() {
  const [history, setHistory] = useState<TerminalHistoryItem[]>([]);
  const [currentCwd, setCurrentCwd] = useState('/root');
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeCommand, setActiveCommand] = useState<string>('');
  const [system, setSystem] = useState<SystemMetrics | null>(null);

  // Modals and Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isProcessOpen, setIsProcessOpen] = useState(false);
  const [initialAiError, setInitialAiError] = useState<{ command: string; errorOutput: string } | null>(null);
  const [aiInitialTab, setAiInitialTab] = useState<'suggest' | 'fix' | 'chat' | 'settings'>('suggest');

  // Fetch Terminal History
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/terminal/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
        if (data.cwd) setCurrentCwd(data.cwd);
      }
    } catch (e) {
      console.warn('Could not fetch history:', e);
    }
  }, []);

  // Fetch System Metrics (CPU, RAM, Processes, Scripts)
  const fetchSystemMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/system/processes');
      if (res.ok) {
        const data = await res.json();
        if (data.system) {
          setSystem(data.system);
          if (data.system.workingDir) setCurrentCwd(data.system.workingDir);
        }
      }
    } catch (e) {
      console.warn('Could not fetch system:', e);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchSystemMetrics();

    const interval = setInterval(() => {
      fetchSystemMetrics();
    }, 4000);

    return () => clearInterval(interval);
  }, [fetchHistory, fetchSystemMetrics]);

  // Execute Command with Real-Time Streaming Logs (Instant output for apt install, updates, builds, scripts)
  const handleExecute = async (command: string) => {
    setIsExecuting(true);
    setActiveCommand(command);
    const activeId = `live-${Date.now()}`;
    
    // Add active streaming placeholder to history immediately
    const liveEntry: TerminalHistoryItem = {
      id: activeId,
      command,
      output: '',
      error: '',
      exitCode: null,
      timestamp: new Date().toLocaleTimeString(),
      cwd: currentCwd,
      durationMs: 0
    };
    setHistory(prev => [...prev, liveEntry]);

    try {
      const res = await fetch('/api/terminal/execute-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });

      if (!res.ok || !res.body) {
        // Fallback to standard execute
        const fallbackRes = await fetch('/api/terminal/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command })
        });
        const data = await fallbackRes.json();
        if (data.cwd) setCurrentCwd(data.cwd);
        await fetchHistory();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedStdout = '';
      let accumulatedStderr = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'stdout' && data.chunk) {
                accumulatedStdout += data.chunk;
                setHistory(prev => prev.map(item => item.id === activeId ? {
                  ...item,
                  output: accumulatedStdout
                } : item));
              } else if (data.type === 'stderr' && data.chunk) {
                accumulatedStderr += data.chunk;
                setHistory(prev => prev.map(item => item.id === activeId ? {
                  ...item,
                  error: accumulatedStderr
                } : item));
              } else if (data.type === 'exit') {
                if (data.cwd) setCurrentCwd(data.cwd);
                setHistory(prev => prev.map(item => item.id === activeId ? {
                  ...item,
                  output: data.output !== undefined ? data.output : accumulatedStdout,
                  error: data.error !== undefined ? data.error : accumulatedStderr,
                  exitCode: data.exitCode,
                  durationMs: data.durationMs || 0
                } : item));
              }
            } catch (e) {}
          }
        }
      }
      await fetchHistory();
      fetchSystemMetrics();
    } catch (err: any) {
      console.error('Command execution failed:', err);
      await fetchHistory();
    } finally {
      setIsExecuting(false);
      setActiveCommand('');
    }
  };

  // Interrupt (Ctrl+C emulation)
  const handleInterrupt = async () => {
    try {
      await fetch('/api/terminal/interrupt', { method: 'POST' });
      await fetchHistory();
    } catch (e) {}
  };

  // Clear Terminal
  const handleClear = async () => {
    try {
      await fetch('/api/terminal/clear', { method: 'POST' });
      setHistory([]);
    } catch (e) {}
  };

  // Open AI Drawer with specific Error to fix
  const handleRequestFixError = (command: string, errorOutput: string) => {
    setInitialAiError({ command, errorOutput });
    setIsAiOpen(true);
  };

  return (
    <div className="h-[100dvh] h-screen w-full max-w-full overflow-hidden bg-[#09090b] text-zinc-100 flex flex-col font-sans select-none fixed inset-0">
      {/* Mobile Top Bar */}
      <MobileTopBar
        system={system}
        onOpenAi={() => {
          setInitialAiError(null);
          setIsAiOpen(true);
        }}
        onOpenProcesses={() => setIsProcessOpen(true)}
        onOpenFileFolder={() => setIsFileManagerOpen(true)}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        onClearTerminal={handleClear}
        currentCwd={currentCwd}
        isExecuting={isExecuting}
      />

      {/* Main Mobile Terminal Screen */}
      <main className="flex-1 overflow-hidden relative">
        <MobileTerminalView
          history={history}
          currentCwd={currentCwd}
          isExecuting={isExecuting}
          onExecute={handleExecute}
          onInterrupt={handleInterrupt}
          onClear={handleClear}
          onRequestFixError={handleRequestFixError}
        />
      </main>

      {/* Side Navigation Drawer (More Menu) */}
      <NavigationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onOpenTerminal={() => {
          setIsDrawerOpen(false);
          setIsFileManagerOpen(false);
          setIsProcessOpen(false);
        }}
        onOpenFileManager={() => setIsFileManagerOpen(true)}
        onOpenAi={() => {
          setInitialAiError(null);
          setAiInitialTab('suggest');
          setIsAiOpen(true);
        }}
        onOpenAiSettings={() => {
          setInitialAiError(null);
          setAiInitialTab('settings');
          setIsAiOpen(true);
        }}
        onOpenProcesses={() => setIsProcessOpen(true)}
        system={system}
        currentCwd={currentCwd}
        isExecuting={isExecuting}
        activeCommand={activeCommand}
      />

      {/* Full-Featured File Manager Modal */}
      <FileManagerModal
        isOpen={isFileManagerOpen}
        onClose={() => setIsFileManagerOpen(false)}
        initialPath={currentCwd}
        onExecuteCommand={handleExecute}
      />

      {/* Gemini AI Copilot Assistant Drawer */}
      <AiAssistantDrawer
        isOpen={isAiOpen}
        onClose={() => {
          setIsAiOpen(false);
          setInitialAiError(null);
        }}
        onRunCommand={(cmd) => handleExecute(cmd)}
        initialError={initialAiError}
        initialTab={aiInitialTab}
        currentCwd={currentCwd}
      />

      {/* Live Process Viewer & Background Scripts Sheet */}
      <ProcessViewerModal
        isOpen={isProcessOpen}
        onClose={() => setIsProcessOpen(false)}
        system={system}
        onRefreshSystem={fetchSystemMetrics}
        onExecuteCommand={handleExecute}
      />
    </div>
  );
}
