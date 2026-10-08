import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Terminal, Wrench, MessageSquare, Play, Copy, Check, X, 
  Send, AlertCircle, RefreshCw, Key, ShieldCheck, Eye, EyeOff, CheckCircle2, ExternalLink
} from 'lucide-react';
import { AiChatMessage } from '../types';

interface AiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (command: string) => void;
  initialError?: { command: string; errorOutput: string } | null;
  initialTab?: 'suggest' | 'fix' | 'chat' | 'settings';
  currentCwd: string;
}

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({
  isOpen,
  onClose,
  onRunCommand,
  initialError,
  initialTab,
  currentCwd
}) => {
  const [tab, setTab] = useState<'suggest' | 'fix' | 'chat' | 'settings'>(initialTab || 'suggest');

  // API Key Status & Custom Key Setting
  const [keyStatus, setKeyStatus] = useState<{
    isConfigured: boolean;
    source: string;
    maskedKey: string;
    model: string;
  } | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keySaving, setKeySaving] = useState(false);
  const [keyFeedback, setKeyFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showKeyText, setShowKeyText] = useState(false);

  // Command Suggester State
  const [suggestQuery, setSuggestQuery] = useState('');
  const [suggestResult, setSuggestResult] = useState<{ command: string; explanation: string } | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // Error Fixer State
  const [errorCmd, setErrorCmd] = useState('');
  const [errorText, setErrorText] = useState('');
  const [fixResult, setFixResult] = useState<{ reason: string; fixCommand: string; explanation: string } | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixErrorMessage, setFixErrorMessage] = useState<string | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! Mai aapka Ubuntu Linux & Server AI Copilot hu. Mujhse koi bhi command mang sakte hain, error fix karwa sakte hain, ya bash script pooch sakte hain!',
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Check current API Key status on mount or open
  const fetchKeyStatus = async () => {
    try {
      const res = await fetch('/api/ai/key-status');
      if (res.ok) {
        const data = await res.json();
        setKeyStatus(data);
      }
    } catch (e) {
      console.warn('Could not fetch API key status:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchKeyStatus();
      if (initialTab) {
        setTab(initialTab);
      }
    }
  }, [isOpen, initialTab]);

  // When opened with initialError, auto-switch to fix tab
  useEffect(() => {
    if (initialError && initialError.errorOutput) {
      setErrorCmd(initialError.command);
      setErrorText(initialError.errorOutput);
      setTab('fix');
      handleFixError(initialError.command, initialError.errorOutput);
    }
  }, [initialError]);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Save / Update Gemini API Key
  const handleSaveApiKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setKeySaving(true);
    setKeyFeedback(null);

    try {
      const res = await fetch('/api/ai/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setKeyFeedback({ type: 'success', text: data.message });
        setKeyInput('');
        await fetchKeyStatus();
      } else {
        setKeyFeedback({ type: 'error', text: data.error || 'Failed to set API key' });
      }
    } catch (err: any) {
      setKeyFeedback({ type: 'error', text: err.message || 'Network error' });
    } finally {
      setKeySaving(false);
    }
  };

  // 1. Suggest Command API Call
  const handleSuggest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!suggestQuery.trim() || suggestLoading) return;

    setSuggestLoading(true);
    setSuggestResult(null);
    setSuggestError(null);
    try {
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: suggestQuery })
      });
      const data = await res.json();
      if (res.ok) {
        setSuggestResult({
          command: data.command,
          explanation: data.explanation
        });
      } else {
        setSuggestError(data.error || 'Failed to suggest command');
      }
    } catch (err: any) {
      setSuggestError(err.message || 'Request failed');
    } finally {
      setSuggestLoading(false);
    }
  };

  // 2. Fix Error API Call
  const handleFixError = async (cmdToFix?: string, errToFix?: string) => {
    const cmd = cmdToFix || errorCmd;
    const errText = errToFix || errorText;
    if (!errText && !cmd) return;

    setFixLoading(true);
    setFixResult(null);
    setFixErrorMessage(null);
    try {
      const res = await fetch('/api/ai/fix-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, errorOutput: errText })
      });
      const data = await res.json();
      if (res.ok) {
        setFixResult({
          reason: data.reason,
          fixCommand: data.fixCommand,
          explanation: data.explanation
        });
      } else {
        setFixErrorMessage(data.error || 'Failed to analyze error');
      }
    } catch (err: any) {
      setFixErrorMessage(err.message || 'Request failed');
    } finally {
      setFixLoading(false);
    }
  };

  // 3. AI Chat Call
  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput.trim();
    const userMsg: AiChatMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString()
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    setChatError(null);

    try {
      const historyPayload = chatMessages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, history: historyPayload })
      });
      const data = await res.json();

      if (res.ok && data.reply) {
        const codeBlockMatch = data.reply.match(/```(?:bash|sh)?\n([\s\S]*?)\n```/);
        const extractedCmd = codeBlockMatch ? codeBlockMatch[1].trim() : undefined;

        const aiMsg: AiChatMessage = {
          id: `${Date.now()}-a`,
          role: 'assistant',
          content: data.reply,
          command: extractedCmd,
          timestamp: new Date().toLocaleTimeString()
        };
        setChatMessages(prev => [...prev, aiMsg]);
      } else {
        setChatError(data.error || 'Chat request failed');
      }
    } catch (err: any) {
      setChatError(err.message || 'Request failed');
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#0e0e14] border-t sm:border border-zinc-800 rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[92dvh] h-[88dvh] sm:h-[750px] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-5">
        {/* Drawer Header */}
        <div className="bg-[#14141c] px-3.5 py-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-white">
                <span>Gemini Linux Copilot</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {keyStatus?.model || 'gemini-3.8-flash'}
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono">
                Ask commands, fix terminal errors & chat in Hindi/English
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab('settings')}
              className={`p-1.5 rounded-lg border transition ${
                tab === 'settings'
                  ? 'bg-purple-600 text-white border-purple-500'
                  : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
              }`}
              title="Gemini API Key Settings"
            >
              <Key className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="bg-zinc-950 p-1.5 border-b border-zinc-800 flex items-center gap-1 text-xs font-mono shrink-0">
          <button
            onClick={() => setTab('suggest')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition ${
              tab === 'suggest'
                ? 'bg-purple-600 text-white font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Ask Command</span>
          </button>

          <button
            onClick={() => setTab('fix')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition ${
              tab === 'fix'
                ? 'bg-purple-600 text-white font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Fix Error</span>
          </button>

          <button
            onClick={() => setTab('chat')}
            className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition ${
              tab === 'chat'
                ? 'bg-purple-600 text-white font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>AI Chat</span>
          </button>

          <button
            onClick={() => setTab('settings')}
            className={`px-3 py-1.5 rounded-lg flex items-center justify-center gap-1 transition ${
              tab === 'settings'
                ? 'bg-purple-600 text-white font-bold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Set API Key"
          >
            <Key className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">API Key</span>
          </button>
        </div>

        {/* If Key is not configured, show friendly warning banner */}
        {keyStatus && !keyStatus.isConfigured && tab !== 'settings' && (
          <div className="bg-amber-950/70 border-b border-amber-800/80 px-3 py-2 flex items-center justify-between text-[11px] text-amber-200 font-mono shrink-0">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Gemini API Key set nahi hai. Set karein to activate AI.</span>
            </span>
            <button
              onClick={() => setTab('settings')}
              className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px]"
            >
              Set Key
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 p-3.5 overflow-y-auto space-y-4 font-mono text-xs">
          {/* TAB 1: COMMAND SUGGESTER */}
          {tab === 'suggest' && (
            <div className="space-y-4">
              <form onSubmit={handleSuggest} className="space-y-2">
                <label className="text-zinc-300 font-semibold block text-[11px]">
                  Kya karna chahte ho? (Ask in Hindi or English):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={suggestQuery}
                    onChange={(e) => setSuggestQuery(e.target.value)}
                    placeholder="e.g. 'find all files over 100MB', 'unzip tar file', 'check ram'..."
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-600"
                  />
                  <button
                    type="submit"
                    disabled={suggestLoading || !suggestQuery.trim()}
                    className="px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1 transition shrink-0"
                  >
                    {suggestLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Ask</span>
                  </button>
                </div>
              </form>

              {/* Common sample prompts */}
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500">Quick ideas:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Check disk space with df -h',
                    'Find memory consuming processes',
                    'Kill process by port 25565',
                    'Show system uptime & load'
                  ].map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSuggestQuery(prompt)}
                      className="text-[10px] px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              {suggestError && (
                <div className="bg-rose-950/60 border border-rose-800 rounded-xl p-3 text-rose-300 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div>{suggestError}</div>
                    <button
                      onClick={() => setTab('settings')}
                      className="text-[10px] underline text-purple-300 font-bold"
                    >
                      Gemini API Key set ya check karein &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Suggest Result Card */}
              {suggestResult && (
                <div className="bg-zinc-950 border border-purple-900/60 rounded-xl p-3.5 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-purple-400 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      Suggested Command:
                    </span>
                  </div>

                  <div className="bg-black p-2.5 rounded-lg border border-zinc-800 font-mono text-emerald-400 break-all select-all">
                    {suggestResult.command}
                  </div>

                  {suggestResult.explanation && (
                    <p className="text-zinc-300 text-[11px] leading-relaxed">
                      {suggestResult.explanation}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        onRunCommand(suggestResult.command);
                        onClose();
                      }}
                      className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 transition active:scale-98 shadow-md"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Run in Terminal</span>
                    </button>

                    <button
                      onClick={() => handleCopy(suggestResult.command, 'suggest-cmd')}
                      className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1 transition"
                    >
                      {copiedKey === 'suggest-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copy</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ERROR FIXER */}
          {tab === 'fix' && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-zinc-300 font-semibold block text-[11px] mb-1">
                    Failed Command (optional):
                  </label>
                  <input
                    type="text"
                    value={errorCmd}
                    onChange={(e) => setErrorCmd(e.target.value)}
                    placeholder="e.g. apt-get install package, python3 main.py"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="text-zinc-300 font-semibold block text-[11px] mb-1">
                    Error Log / Output:
                  </label>
                  <textarea
                    rows={4}
                    value={errorText}
                    onChange={(e) => setErrorText(e.target.value)}
                    placeholder="Paste the terminal error log here (e.g. command not found, permission denied, port in use)..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-rose-300 placeholder-zinc-500 focus:outline-none focus:border-purple-600 leading-relaxed font-mono"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleFixError()}
                  disabled={fixLoading || (!errorText.trim() && !errorCmd.trim())}
                  className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-98 shadow-md"
                >
                  {fixLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                  <span>Diagnose & Fix Error with AI</span>
                </button>
              </div>

              {fixErrorMessage && (
                <div className="bg-rose-950/60 border border-rose-800 rounded-xl p-3 text-rose-300 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div>{fixErrorMessage}</div>
                    <button
                      onClick={() => setTab('settings')}
                      className="text-[10px] underline text-purple-300 font-bold"
                    >
                      Gemini API Key set ya check karein &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Fix Result Card */}
              {fixResult && (
                <div className="bg-zinc-950 border border-purple-900/60 rounded-xl p-3.5 space-y-3 shadow-lg">
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Reason:</span>
                    <p className="text-amber-300 font-semibold text-xs">{fixResult.reason}</p>
                  </div>

                  {fixResult.fixCommand && (
                    <div className="space-y-2">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold">Fix Command:</span>
                      <div className="bg-black p-2.5 rounded-lg border border-zinc-800 font-mono text-emerald-400 break-all select-all">
                        {fixResult.fixCommand}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => {
                            onRunCommand(fixResult.fixCommand);
                            onClose();
                          }}
                          className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 transition active:scale-98 shadow-md"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Run Fix in Terminal</span>
                        </button>

                        <button
                          onClick={() => handleCopy(fixResult.fixCommand, 'fix-cmd')}
                          className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1 transition"
                        >
                          {copiedKey === 'fix-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>Copy</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {fixResult.explanation && (
                    <p className="text-zinc-400 text-[10px] leading-relaxed pt-1">
                      {fixResult.explanation}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AI CHAT */}
          {tab === 'chat' && (
            <div className="flex flex-col h-[calc(88dvh-130px)] sm:h-[580px]">
              {/* Message History */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-3">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-xl space-y-2 ${
                      msg.role === 'user'
                        ? 'bg-purple-950/40 border border-purple-800/40 ml-4 text-purple-100'
                        : 'bg-zinc-950 border border-zinc-800 mr-2 text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>{msg.role === 'user' ? 'You' : 'Gemini AI'}</span>
                      <span>{msg.timestamp}</span>
                    </div>

                    <div className="whitespace-pre-wrap leading-relaxed text-[11px]">
                      {msg.content}
                    </div>

                    {/* Quick Run Button if command was extracted */}
                    {msg.command && (
                      <div className="pt-1.5 flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (msg.command) onRunCommand(msg.command);
                            onClose();
                          }}
                          className="px-3 py-1 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[10px] flex items-center gap-1"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Run command</span>
                        </button>
                        <button
                          onClick={() => handleCopy(msg.command || '', `chat-${msg.id}`)}
                          className="p-1 rounded bg-zinc-800 text-zinc-300 hover:text-white"
                        >
                          {copiedKey === `chat-${msg.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex items-center gap-2 text-zinc-400 text-xs italic py-2 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                    <span>Gemini is thinking...</span>
                  </div>
                )}

                {chatError && (
                  <div className="bg-rose-950/60 border border-rose-800 rounded-xl p-2.5 text-rose-300 text-[11px] flex items-center justify-between">
                    <span>{chatError}</span>
                    <button
                      onClick={() => setTab('settings')}
                      className="underline text-purple-300 font-bold ml-2 text-[10px]"
                    >
                      Set API Key
                    </button>
                  </div>
                )}
              </div>

              {/* Chat Input Field */}
              <form onSubmit={handleSendChat} className="pt-2 border-t border-zinc-800 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask any question about Linux, server, commands..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-600"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="p-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white transition active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: GEMINI API KEY SETTINGS */}
          {tab === 'settings' && (
            <div className="space-y-4">
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-950 text-purple-400 border border-purple-800 flex items-center justify-center">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-xs">Gemini API Key Configuration</h3>
                    <p className="text-[10px] text-zinc-400">
                      Deploy hone ke baad apni free Gemini API key yahan set karein
                    </p>
                  </div>
                </div>

                {/* Key Status Pill */}
                <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Current Status:</span>
                    {keyStatus?.isConfigured ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Active ({keyStatus.source === 'env' ? 'Environment' : 'Configured'})</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800 text-[11px] font-bold">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Not Set</span>
                      </span>
                    )}
                  </div>

                  {keyStatus?.isConfigured && keyStatus.maskedKey && (
                    <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-800/80">
                      <span className="text-zinc-500">Active Key:</span>
                      <span className="text-zinc-300 font-bold">{keyStatus.maskedKey}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-800/80">
                    <span className="text-zinc-500">Working Model:</span>
                    <span className="text-purple-400 font-bold">{keyStatus?.model || 'gemini-3.8-flash'}</span>
                  </div>
                </div>

                {/* Set API Key Form */}
                <form onSubmit={handleSaveApiKey} className="space-y-3 pt-2">
                  <div>
                    <label className="text-zinc-200 font-semibold block text-[11px] mb-1">
                      Enter Free Gemini API Key:
                    </label>
                    <div className="relative">
                      <input
                        type={showKeyText ? 'text' : 'password'}
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 pr-9 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeyText(!showKeyText)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                        title={showKeyText ? 'Hide key' : 'Show key'}
                      >
                        {showKeyText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Aapki key securely server runtime memory me save hoti hai aur terminal commands suggest ya errors fix karne ke liye use hoti hai.
                    </p>
                  </div>

                  {keyFeedback && (
                    <div className={`p-2.5 rounded-lg text-[11px] font-mono flex items-center gap-1.5 ${
                      keyFeedback.type === 'success'
                        ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                        : 'bg-rose-950 border border-rose-800 text-rose-300'
                    }`}>
                      {keyFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>{keyFeedback.text}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={keySaving || !keyInput.trim()}
                      className="flex-1 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-98 shadow-md"
                    >
                      {keySaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      <span>Save Gemini API Key</span>
                    </button>

                    {keyStatus?.isConfigured && (
                      <button
                        type="button"
                        onClick={() => {
                          setKeyInput('');
                          handleSaveApiKey();
                        }}
                        className="px-3 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs transition"
                        title="Reset API Key"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Free Key Tutorial Card */}
              <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 space-y-2 text-[11px] text-zinc-400">
                <span className="font-bold text-zinc-200 block text-xs">
                  Free Gemini API Key kaise banayein?
                </span>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                  <li>Google AI Studio (<span className="text-purple-400 font-mono">aistudio.google.com</span>) par login karein.</li>
                  <li>Top-left menu se <strong>"Get API key"</strong> par tap karein.</li>
                  <li><strong>"Create API key"</strong> button dabayein aur key copy karein.</li>
                  <li>Upar diye gaye box me paste karke <strong>Save</strong> karein.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
