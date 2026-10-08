import React, { useState, useEffect } from 'react';
import { Sparkles, Terminal, Wrench, MessageSquare, Play, Copy, Check, X, Send, AlertCircle, RefreshCw } from 'lucide-react';
import { AiChatMessage } from '../types';

interface AiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (command: string) => void;
  initialError?: { command: string; errorOutput: string } | null;
  currentCwd: string;
}

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({
  isOpen,
  onClose,
  onRunCommand,
  initialError,
  currentCwd
}) => {
  const [tab, setTab] = useState<'suggest' | 'fix' | 'chat'>('suggest');

  // Command Suggester State
  const [suggestQuery, setSuggestQuery] = useState('');
  const [suggestResult, setSuggestResult] = useState<{ command: string; explanation: string } | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);

  // Error Fixer State
  const [errorCmd, setErrorCmd] = useState('');
  const [errorText, setErrorText] = useState('');
  const [fixResult, setFixResult] = useState<{ reason: string; fixCommand: string; explanation: string } | null>(null);
  const [fixLoading, setFixLoading] = useState(false);

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

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

  // 1. Suggest Command API Call
  const handleSuggest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!suggestQuery.trim() || suggestLoading) return;

    setSuggestLoading(true);
    setSuggestResult(null);
    try {
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: suggestQuery, cwd: currentCwd })
      });
      const data = await res.json();
      if (res.ok) {
        setSuggestResult({
          command: data.command,
          explanation: data.explanation
        });
      }
    } catch (err) {
      console.error(err);
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
      }
    } catch (err) {
      console.error(err);
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
        // Extract command if present in markdown code block
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
      }
    } catch (err) {
      console.error(err);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#0e0e14] border-t sm:border border-zinc-800 rounded-t-2xl sm:rounded-2xl max-w-lg w-full max-h-[90vh] h-[85vh] sm:h-[750px] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-5">
        {/* Drawer Header */}
        <div className="bg-[#14141c] p-3.5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-white">
                <span>Gemini Linux Copilot</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  gemini-3.5-flash-lite
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono">
                Ask commands, fix terminal errors & chat in Hindi/English
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="bg-zinc-950 p-1.5 border-b border-zinc-800 flex items-center gap-1 text-xs font-mono">
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
        </div>

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
                      onClick={() => {
                        setSuggestQuery(prompt);
                      }}
                      className="text-[10px] px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Suggest Result Card */}
              {suggestResult && (
                <div className="bg-zinc-950 border border-purple-900/60 rounded-xl p-3.5 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-purple-400 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      Suggested Command:
                    </span>
                  </div>

                  <div className="bg-black/80 border border-zinc-800 p-2.5 rounded-lg text-emerald-400 font-bold select-all break-all">
                    $ {suggestResult.command}
                  </div>

                  <p className="text-zinc-300 text-[11px] leading-relaxed">
                    {suggestResult.explanation}
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        onRunCommand(suggestResult.command);
                        onClose();
                      }}
                      className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Run in Terminal</span>
                    </button>

                    <button
                      onClick={() => handleCopy(suggestResult.command, 'sug-cmd')}
                      className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1 transition"
                    >
                      {copiedKey === 'sug-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
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
              <div className="space-y-2">
                <label className="text-zinc-300 font-semibold block text-[11px]">
                  Failed Command:
                </label>
                <input
                  type="text"
                  value={errorCmd}
                  onChange={(e) => setErrorCmd(e.target.value)}
                  placeholder="e.g. apt install package-name or java -jar..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-600"
                />

                <label className="text-zinc-300 font-semibold block text-[11px] pt-1">
                  Error Output from Terminal:
                </label>
                <textarea
                  value={errorText}
                  onChange={(e) => setErrorText(e.target.value)}
                  rows={4}
                  placeholder="Paste error message or output here..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-rose-300 placeholder-zinc-600 focus:outline-none focus:border-purple-600 font-mono"
                />

                <button
                  type="button"
                  onClick={() => handleFixError()}
                  disabled={fixLoading || (!errorCmd && !errorText)}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  {fixLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                  <span>Diagnose & Fix with AI</span>
                </button>
              </div>

              {/* Fix Result Card */}
              {fixResult && (
                <div className="bg-zinc-950 border border-rose-900/40 rounded-xl p-3.5 space-y-3 shadow-lg">
                  <div>
                    <span className="text-[11px] font-bold text-rose-400 block mb-1">
                      Problem:
                    </span>
                    <p className="text-zinc-300 text-[11px] leading-relaxed">
                      {fixResult.reason}
                    </p>
                  </div>

                  {fixResult.fixCommand && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-emerald-400 block">
                        Fix Command:
                      </span>
                      <div className="bg-black/90 border border-emerald-900/60 p-2.5 rounded-lg text-emerald-400 font-bold select-all break-all">
                        $ {fixResult.fixCommand}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => {
                            onRunCommand(fixResult.fixCommand);
                            onClose();
                          }}
                          className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
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
            <div className="flex flex-col h-[520px]">
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
              </div>

              {/* Chat Input Field */}
              <form onSubmit={handleSendChat} className="pt-2 border-t border-zinc-800 flex items-center gap-2">
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
        </div>
      </div>
    </div>
  );
};
