import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, exec, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import AdmZip from 'adm-zip';
import { GoogleGenAI } from '@google/genai';

// Configured user API key in memory if changed via Settings/UI in deployed environments
let customGeminiApiKey = process.env.GEMINI_API_KEY || '';

// Get or create Gemini client using available key
function getGeminiClient(userKey?: string): GoogleGenAI {
  const activeKey = (userKey && userKey.trim()) || customGeminiApiKey || process.env.GEMINI_API_KEY;
  return new GoogleGenAI({
    apiKey: activeKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Helper for AI generation using Gemini free tier compatible models
async function callGeminiAi(prompt: string, systemInstruction?: string, userKey?: string): Promise<string> {
  const activeKey = (userKey && userKey.trim()) || customGeminiApiKey || process.env.GEMINI_API_KEY;
  if (!activeKey) {
    throw new Error('Gemini API Key is not set. Please set your free Gemini API Key in the AI Copilot settings.');
  }

  const client = getGeminiClient(activeKey);
  const modelsToTry = [
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite'
  ];

  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });
      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn(`[Gemini AI] Model ${model} failed, trying next:`, err?.message || err);
      lastError = err;
    }
  }
  throw new Error(`Gemini AI service unavailable: ${lastError?.message || 'Check API key or quota'}`);
}

// Directory resolution for both ESM and CJS
let serverDir = process.cwd();
try {
  if (typeof __dirname !== 'undefined') {
    serverDir = __dirname;
  } else if (typeof import.meta !== 'undefined' && import.meta && import.meta.url) {
    serverDir = path.dirname(fileURLToPath(import.meta.url));
  }
} catch (e) {
  serverDir = process.cwd();
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories
const IS_CONTAINER = fs.existsSync('/minecraft-paper') || fs.existsSync('/minecraft-bedrock');
const PAPER_DIR = fs.existsSync('/minecraft-paper') 
  ? '/minecraft-paper' 
  : path.join(process.cwd(), 'data', 'minecraft-paper');
const PLUGINS_DIR = path.join(PAPER_DIR, 'plugins');
const LOGS_DIR = path.join(PAPER_DIR, 'logs');
const CONFIG_DIR = path.join(PAPER_DIR, 'config');
const PLAYIT_CONFIG_DIR = IS_CONTAINER ? '/root/.config/playit' : path.join(process.cwd(), 'data', 'playit');

for (const dir of [PAPER_DIR, PLUGINS_DIR, LOGS_DIR, CONFIG_DIR, PLAYIT_CONFIG_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Ensure eula.txt exists with eula=true
const EULA_FILE = path.join(PAPER_DIR, 'eula.txt');
if (!fs.existsSync(EULA_FILE)) {
  fs.writeFileSync(EULA_FILE, 'eula=true\n', 'utf-8');
}

// Ensure server.properties exists for PaperMC
const PROPERTIES_FILE = path.join(PAPER_DIR, 'server.properties');
const defaultPaperProperties = `server-port=25565
motd=PaperMC Bukkit Server with GeyserMC
max-players=20
online-mode=false
difficulty=normal
gamemode=survival
pvp=true
view-distance=10
simulation-distance=5
spawn-protection=0
allow-flight=true
network-compression-threshold=256
white-list=false
enable-command-block=true
`;

if (!fs.existsSync(PROPERTIES_FILE)) {
  fs.writeFileSync(PROPERTIES_FILE, defaultPaperProperties, 'utf-8');
}

// -------------------------------------------------------------
// Interactive Terminal State & Active Process Tracking
// -------------------------------------------------------------
let currentWorkingDir = IS_CONTAINER ? '/root' : process.cwd();
interface TerminalHistoryItem {
  id: string;
  command: string;
  output: string;
  error?: string;
  exitCode: number;
  timestamp: string;
  cwd: string;
  durationMs: number;
}
const terminalHistory: TerminalHistoryItem[] = [];

let activeChildProcess: ChildProcess | null = null;
let activeProcessDetails: { command: string; pid: number; startedAt: number } | null = null;

// Helper to download files via https/http
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, {
      headers: {
        'User-Agent': 'Ubuntu-PaperMC-Control-Panel/1.0'
      }
    }, (response) => {
      // Handle HTTP redirects (301, 302, 307, 308)
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch (e) {}
        return reject(new Error(`Server returned HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
    });

    request.on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch (e) {}
      reject(err);
    });

    request.setTimeout(45000, () => {
      request.destroy();
      try { fs.unlinkSync(destPath); } catch (e) {}
      reject(new Error('Download timed out after 45 seconds'));
    });
  });
}

// -------------------------------------------------------------
// PaperMC Server Management
// -------------------------------------------------------------
let paperProcess: ChildProcess | null = null;
let paperStatus: 'offline' | 'starting' | 'online' | 'stopping' = 'offline';
let paperStartTime: number | null = null;
const paperLogs: { id: string; timestamp: string; level: 'INFO' | 'WARN' | 'ERROR' | 'COMMAND'; message: string }[] = [];

function addPaperLog(message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'COMMAND' = 'INFO') {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString(),
    level,
    message: message.trim()
  };
  paperLogs.push(entry);
  if (paperLogs.length > 1000) {
    paperLogs.shift();
  }
}

// Check installed Paper jar
function getPaperJarInfo() {
  const paperJarPath = path.join(PAPER_DIR, 'paper.jar');
  if (fs.existsSync(paperJarPath)) {
    const stats = fs.statSync(paperJarPath);
    return {
      exists: true,
      filename: 'paper.jar',
      sizeMb: +(stats.size / (1024 * 1024)).toFixed(2),
      modifiedAt: stats.mtime.toISOString()
    };
  }
  // Check for any paper*.jar
  try {
    const files = fs.readdirSync(PAPER_DIR);
    const jar = files.find(f => f.startsWith('paper') && f.endsWith('.jar'));
    if (jar) {
      const stats = fs.statSync(path.join(PAPER_DIR, jar));
      return {
        exists: true,
        filename: jar,
        sizeMb: +(stats.size / (1024 * 1024)).toFixed(2),
        modifiedAt: stats.mtime.toISOString()
      };
    }
  } catch (e) {}

  return { exists: false, filename: null, sizeMb: 0, modifiedAt: null };
}

// Detect Java installation and version
function getJavaVersion(): Promise<{ installed: boolean; version: string }> {
  return new Promise((resolve) => {
    exec('java -version', (error, stdout, stderr) => {
      if (error) {
        // Try common java paths
        exec('/opt/java/bin/java -version', (err2, out2, err2_output) => {
          if (err2) {
            resolve({ installed: false, version: 'Not found' });
          } else {
            const output = err2_output || out2;
            const match = output.match(/version "([^"]+)"/) || output.match(/openjdk (\S+)/);
            resolve({ installed: true, version: match ? match[1] : 'Java 21 (Adoptium)' });
          }
        });
      } else {
        const output = stderr || stdout;
        const match = output.match(/version "([^"]+)"/) || output.match(/openjdk (\S+)/);
        resolve({ installed: true, version: match ? match[1] : 'Java 21' });
      }
    });
  });
}

// -------------------------------------------------------------
// Curated Paper/Bukkit Plugins Catalog
// -------------------------------------------------------------
interface PluginInfo {
  id: string;
  name: string;
  filename: string;
  description: string;
  category: 'bridge' | 'auth' | 'utility' | 'admin' | 'world';
  downloadUrl: string;
  isGeyser?: boolean;
  isFloodgate?: boolean;
}

const PLUGIN_CATALOG: PluginInfo[] = [
  {
    id: 'geyser',
    name: 'GeyserMC (Bedrock Bridge)',
    filename: 'Geyser-Spigot.jar',
    description: 'Enables Minecraft Bedrock Edition (iOS, Android, Windows, Consoles) players to join this PaperMC Bukkit server on UDP port 19132!',
    category: 'bridge',
    downloadUrl: 'https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot',
    isGeyser: true
  },
  {
    id: 'floodgate',
    name: 'Floodgate (Bedrock Auth)',
    filename: 'Floodgate-Spigot.jar',
    description: 'Allows Bedrock players to join without requiring a Java Edition Minecraft account and synchronizes Bedrock Xbox skins.',
    category: 'auth',
    downloadUrl: 'https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot',
    isFloodgate: true
  },
  {
    id: 'viaversion',
    name: 'ViaVersion',
    filename: 'ViaVersion.jar',
    description: 'Allows newer and older Minecraft client versions to connect to your Paper server seamlessly.',
    category: 'utility',
    downloadUrl: 'https://github.com/ViaVersion/ViaVersion/releases/latest/download/ViaVersion.jar'
  },
  {
    id: 'essentialsx',
    name: 'EssentialsX',
    filename: 'EssentialsX.jar',
    description: 'The standard suite of over 100 essential Bukkit commands (/sethome, /home, /spawn, /warp, /tpa, /back, economy, kits).',
    category: 'utility',
    downloadUrl: 'https://github.com/EssentialsX/Essentials/releases/latest/download/EssentialsX.jar'
  },
  {
    id: 'luckperms',
    name: 'LuckPerms',
    filename: 'LuckPerms-Bukkit.jar',
    description: 'The industry-standard permissions management plugin for Bukkit/Paper servers with web editor support.',
    category: 'admin',
    downloadUrl: 'https://download.luckperms.net/1556/bukkit/loader/LuckPerms-Bukkit-5.4.145.jar'
  },
  {
    id: 'chunky',
    name: 'Chunky',
    filename: 'Chunky.jar',
    description: 'Pre-generates world chunks asynchronously to permanently eliminate server lag when players explore new areas.',
    category: 'world',
    downloadUrl: 'https://github.com/pop4959/Chunky/releases/latest/download/Chunky.jar'
  },
  {
    id: 'vault',
    name: 'Vault',
    filename: 'Vault.jar',
    description: 'Provides standardized Permissions, Chat, and Economy API hooks for all other Bukkit plugins.',
    category: 'utility',
    downloadUrl: 'https://github.com/MilkBowl/Vault/releases/latest/download/Vault.jar'
  }
];

// Helper to list plugins in PLUGINS_DIR
function getInstalledPluginsList() {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  const files = fs.readdirSync(PLUGINS_DIR);
  return files.filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled')).map(f => {
    const isEnabled = !f.endsWith('.disabled');
    const cleanName = f.replace('.disabled', '');
    const fullPath = path.join(PLUGINS_DIR, f);
    const stats = fs.statSync(fullPath);
    return {
      filename: f,
      name: cleanName.replace('.jar', ''),
      sizeMb: +(stats.size / (1024 * 1024)).toFixed(2),
      enabled: isEnabled,
      isGeyser: cleanName.toLowerCase().includes('geyser'),
      isFloodgate: cleanName.toLowerCase().includes('floodgate'),
      modifiedAt: stats.mtime.toISOString()
    };
  });
}

// =============================================================
// API ROUTES
// =============================================================

// 1. Interactive Terminal: Execute real Ubuntu RDP command
app.post('/api/terminal/execute', async (req, res) => {
  const rawCommand = req.body.command;
  if (!rawCommand || typeof rawCommand !== 'string') {
    return res.status(400).json({ error: 'Command is required' });
  }

  const trimmed = rawCommand.trim();
  const startTime = Date.now();

  // Handle cd command specifically to maintain persistent shell working directory
  if (trimmed.startsWith('cd ') || trimmed === 'cd') {
    let targetDir = trimmed === 'cd' ? (IS_CONTAINER ? '/root' : os.homedir()) : trimmed.slice(3).trim();
    if (targetDir.startsWith('~')) {
      targetDir = path.join(IS_CONTAINER ? '/root' : os.homedir(), targetDir.slice(1));
    }
    const resolvedPath = path.resolve(currentWorkingDir, targetDir);
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      currentWorkingDir = resolvedPath;
      const historyItem: TerminalHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        command: trimmed,
        output: '',
        exitCode: 0,
        timestamp: new Date().toLocaleTimeString(),
        cwd: currentWorkingDir,
        durationMs: Date.now() - startTime
      };
      terminalHistory.push(historyItem);
      return res.json({
        output: `Changed directory to: ${currentWorkingDir}`,
        error: '',
        exitCode: 0,
        cwd: currentWorkingDir,
        durationMs: Date.now() - startTime
      });
    } else {
      return res.json({
        output: '',
        error: `bash: cd: ${targetDir}: No such file or directory`,
        exitCode: 1,
        cwd: currentWorkingDir,
        durationMs: Date.now() - startTime
      });
    }
  }

  // Execute shell command with bash or sh
  const shell = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
  exec(trimmed, {
    cwd: currentWorkingDir,
    shell,
    timeout: 30000, // 30 second execution safety limit
    maxBuffer: 10 * 1024 * 1024, // 10MB stdout buffer
    env: {
      ...process.env,
      DEBIAN_FRONTEND: 'noninteractive',
      TERM: 'xterm-256color',
      PATH: `/opt/java/bin:${process.env.PATH}:/usr/local/bin:/usr/bin:/bin`
    }
  }, (error, stdout, stderr) => {
    const durationMs = Date.now() - startTime;
    const exitCode = error ? (error.code ?? 1) : 0;
    const historyItem: TerminalHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: trimmed,
      output: stdout || '',
      error: stderr || (error ? error.message : ''),
      exitCode,
      timestamp: new Date().toLocaleTimeString(),
      cwd: currentWorkingDir,
      durationMs
    };

    terminalHistory.push(historyItem);
    if (terminalHistory.length > 500) {
      terminalHistory.shift();
    }

    res.json({
      output: stdout || '',
      error: stderr || (error ? error.message : ''),
      exitCode,
      cwd: currentWorkingDir,
      durationMs
    });
  });
});

// 1.5. Real-Time Streaming Command Execution (Live Logs for Installation & Updates)
app.post('/api/terminal/execute-stream', (req, res) => {
  const rawCommand = req.body.command;
  if (!rawCommand || typeof rawCommand !== 'string') {
    return res.status(400).json({ error: 'Command is required' });
  }

  const trimmed = rawCommand.trim();
  const startTime = Date.now();

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering on Nginx/Cloud proxies
  if (res.flushHeaders) res.flushHeaders();

  // Handle cd command
  if (trimmed.startsWith('cd ') || trimmed === 'cd') {
    let targetDir = trimmed === 'cd' ? (IS_CONTAINER ? '/root' : os.homedir()) : trimmed.slice(3).trim();
    if (targetDir.startsWith('~')) {
      targetDir = path.join(IS_CONTAINER ? '/root' : os.homedir(), targetDir.slice(1));
    }
    const resolvedPath = path.resolve(currentWorkingDir, targetDir);
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
      currentWorkingDir = resolvedPath;
      const historyItem: TerminalHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        command: trimmed,
        output: `Changed directory to: ${currentWorkingDir}`,
        exitCode: 0,
        timestamp: new Date().toLocaleTimeString(),
        cwd: currentWorkingDir,
        durationMs: Date.now() - startTime
      };
      terminalHistory.push(historyItem);

      res.write(`data: ${JSON.stringify({ type: 'stdout', chunk: `Changed directory to: ${currentWorkingDir}\n` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 0, cwd: currentWorkingDir, durationMs: Date.now() - startTime })}\n\n`);
      return res.end();
    } else {
      const historyItem: TerminalHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        command: trimmed,
        output: '',
        error: `bash: cd: ${targetDir}: No such file or directory`,
        exitCode: 1,
        timestamp: new Date().toLocaleTimeString(),
        cwd: currentWorkingDir,
        durationMs: Date.now() - startTime
      };
      terminalHistory.push(historyItem);

      res.write(`data: ${JSON.stringify({ type: 'stderr', chunk: `bash: cd: ${targetDir}: No such file or directory\n` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'exit', exitCode: 1, cwd: currentWorkingDir, durationMs: Date.now() - startTime })}\n\n`);
      return res.end();
    }
  }

  // Spawn real shell process for live streaming output
  const shell = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
  let accumulatedStdout = '';
  let accumulatedStderr = '';

  const child = spawn(shell, ['-c', trimmed], {
    cwd: currentWorkingDir,
    env: {
      ...process.env,
      DEBIAN_FRONTEND: 'noninteractive', // Prevents package managers from hanging on interactive prompts
      TERM: 'xterm-256color',
      PATH: `/opt/java/bin:${process.env.PATH}:/usr/local/bin:/usr/bin:/bin`
    }
  });

  activeChildProcess = child;
  activeProcessDetails = {
    command: trimmed,
    pid: child.pid || 0,
    startedAt: startTime
  };

  res.write(`data: ${JSON.stringify({ type: 'start', pid: child.pid, cwd: currentWorkingDir })}\n\n`);

  child.stdout.on('data', (data) => {
    const chunk = data.toString('utf-8');
    accumulatedStdout += chunk;
    res.write(`data: ${JSON.stringify({ type: 'stdout', chunk })}\n\n`);
  });

  child.stderr.on('data', (data) => {
    const chunk = data.toString('utf-8');
    accumulatedStderr += chunk;
    res.write(`data: ${JSON.stringify({ type: 'stderr', chunk })}\n\n`);
  });

  child.on('close', (code) => {
    const durationMs = Date.now() - startTime;
    const exitCode = code ?? 0;

    const historyItem: TerminalHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      command: trimmed,
      output: accumulatedStdout,
      error: accumulatedStderr,
      exitCode,
      timestamp: new Date().toLocaleTimeString(),
      cwd: currentWorkingDir,
      durationMs
    };
    terminalHistory.push(historyItem);
    if (terminalHistory.length > 500) {
      terminalHistory.shift();
    }

    res.write(`data: ${JSON.stringify({
      type: 'exit',
      exitCode,
      cwd: currentWorkingDir,
      durationMs,
      output: accumulatedStdout,
      error: accumulatedStderr
    })}\n\n`);

    if (activeChildProcess === child) {
      activeChildProcess = null;
      activeProcessDetails = null;
    }

    res.end();
  });

  child.on('error', (err) => {
    const durationMs = Date.now() - startTime;
    accumulatedStderr += `\nFailed to start process: ${err.message}`;

    res.write(`data: ${JSON.stringify({
      type: 'stderr',
      chunk: `\nFailed to start process: ${err.message}\n`
    })}\n\n`);

    res.write(`data: ${JSON.stringify({
      type: 'exit',
      exitCode: 1,
      cwd: currentWorkingDir,
      durationMs
    })}\n\n`);

    if (activeChildProcess === child) {
      activeChildProcess = null;
      activeProcessDetails = null;
    }

    res.end();
  });

  // Client disconnected early
  req.on('close', () => {
    // If client disconnected, we don't immediately kill long installs like apt-get, but detach
  });
});

// 2. Terminal History & Clear
app.get('/api/terminal/history', (req, res) => {
  res.json({
    history: terminalHistory,
    cwd: currentWorkingDir,
    activeProcess: activeProcessDetails ? {
      ...activeProcessDetails,
      elapsedSeconds: Math.floor((Date.now() - activeProcessDetails.startedAt) / 1000)
    } : null
  });
});

app.post('/api/terminal/clear', (req, res) => {
  terminalHistory.length = 0;
  res.json({ success: true });
});

// Terminal Interrupt (Ctrl+C / SIGINT signal)
app.post('/api/terminal/interrupt', (req, res) => {
  let killed = false;
  if (activeChildProcess) {
    try {
      activeChildProcess.kill('SIGINT');
      killed = true;
      setTimeout(() => {
        if (activeChildProcess) {
          try { activeChildProcess.kill('SIGKILL'); } catch (e) {}
        }
      }, 1500);
    } catch (e) {}
  }

  const historyItem: TerminalHistoryItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    command: '^C',
    output: '',
    error: '',
    exitCode: 130,
    timestamp: new Date().toLocaleTimeString(),
    cwd: currentWorkingDir,
    durationMs: 0
  };
  terminalHistory.push(historyItem);
  activeChildProcess = null;
  activeProcessDetails = null;

  res.json({ success: true, interrupted: true, killedProcess: killed });
});

// 2.5 Check if any installation / update is currently running in background
app.get('/api/system/install-status', (req, res) => {
  // Check if our own terminal is running something
  if (activeProcessDetails) {
    return res.json({
      isRunning: true,
      command: activeProcessDetails.command,
      pid: activeProcessDetails.pid,
      elapsedSeconds: Math.floor((Date.now() - activeProcessDetails.startedAt) / 1000)
    });
  }

  // Check system processes for apt/dpkg/npm
  exec("ps -eo pid,comm,args | grep -E 'apt-get|apt|dpkg|npm|pip|yarn|cargo' | grep -v grep", (err, stdout) => {
    if (!err && stdout && stdout.trim()) {
      const line = stdout.trim().split('\n')[0];
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[0], 10);
      const args = parts.slice(2).join(' ') || parts[1];
      return res.json({
        isRunning: true,
        command: args,
        pid,
        elapsedSeconds: 0
      });
    }
    res.json({ isRunning: false, command: null, pid: null, elapsedSeconds: 0 });
  });
});

// -------------------------------------------------------------
// Gemini AI Assistant Endpoints
// (Uses gemini-3.8-flash, gemini-flash-latest, etc.)
// -------------------------------------------------------------

// Check API Key Status
app.get('/api/ai/key-status', (req, res) => {
  const activeKey = customGeminiApiKey || process.env.GEMINI_API_KEY || '';
  const isSet = Boolean(activeKey && activeKey.trim().length > 0);
  const isFromEnv = Boolean(process.env.GEMINI_API_KEY && !customGeminiApiKey);
  const maskedKey = isSet
    ? `${activeKey.slice(0, 4)}••••••••${activeKey.slice(-4)}`
    : '';

  res.json({
    isConfigured: isSet,
    source: isFromEnv ? 'env' : (customGeminiApiKey ? 'user' : 'none'),
    maskedKey,
    model: 'gemini-3.8-flash'
  });
});

// Set or Update Gemini API Key (e.g. for self-deployed instances or custom keys)
app.post('/api/ai/set-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    // If empty string sent, revert to env key if present
    customGeminiApiKey = '';
    const hasEnv = Boolean(process.env.GEMINI_API_KEY);
    return res.json({
      success: true,
      message: hasEnv ? 'Reverted to environment GEMINI_API_KEY' : 'API Key cleared',
      isConfigured: hasEnv
    });
  }

  const cleanKey = apiKey.trim();
  customGeminiApiKey = cleanKey;
  // Also keep process.env updated so other parts see it
  process.env.GEMINI_API_KEY = cleanKey;

  res.json({
    success: true,
    message: 'Gemini API Key successfully saved and active!',
    isConfigured: true,
    maskedKey: `${cleanKey.slice(0, 4)}••••••••${cleanKey.slice(-4)}`
  });
});

// AI Command Suggestion
app.post('/api/ai/suggest', async (req, res) => {
  const { query, apiKey } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const prompt = `You are an expert Ubuntu Linux terminal assistant.
The user wants to accomplish this: "${query}".
The current working directory is "${currentWorkingDir}".

Provide:
1. The EXACT single or multi-step bash command to run (ready to copy or execute).
2. A very brief 1-2 sentence explanation in Hindi or English (friendly and concise).

Format your response as:
COMMAND: <the command here>
EXPLANATION: <brief explanation here>`;

    const text = await callGeminiAi(prompt, 'You are an Ubuntu Linux terminal expert assistant on mobile. Respond concisely.', apiKey);
    
    // Parse command and explanation
    let command = '';
    let explanation = text;

    const commandMatch = text.match(/COMMAND:\s*([\s\S]*?)(?=EXPLANATION:|$)/i);
    const explanationMatch = text.match(/EXPLANATION:\s*([\s\S]*)/i);

    if (commandMatch) {
      command = commandMatch[1].trim().replace(/^`+|`+$/g, '');
    } else {
      // Extract first code block or line
      const codeBlockMatch = text.match(/```(?:bash|sh)?\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        command = codeBlockMatch[1].trim();
      }
    }

    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    }

    res.json({
      command: command || query,
      explanation,
      rawReply: text
    });
  } catch (err: any) {
    console.error('[Gemini AI suggest error]:', err);
    res.status(500).json({ error: err.message || 'Failed to suggest command' });
  }
});

// AI Error Fixer
app.post('/api/ai/fix-error', async (req, res) => {
  const { command, errorOutput, apiKey } = req.body;
  if (!errorOutput && !command) {
    return res.status(400).json({ error: 'Command and errorOutput are required' });
  }

  try {
    const prompt = `The user ran this command on Ubuntu 22.04:
$ ${command || 'unknown command'}
Working Directory: ${currentWorkingDir}

And got this error:
${errorOutput || 'Non-zero exit code failure'}

Please diagnose why this failed and provide the exact fix:
1. What went wrong (1 short sentence).
2. The exact terminal command(s) to fix it.

Format your response as:
REASON: <1 sentence reason>
FIX_COMMAND: <exact command to run to fix it>
EXPLANATION: <short explanation>`;

    const text = await callGeminiAi(prompt, 'You are a fast Ubuntu Linux error troubleshooting expert on mobile.', apiKey);

    let fixCommand = '';
    let reason = '';
    let explanation = text;

    const reasonMatch = text.match(/REASON:\s*([\s\S]*?)(?=FIX_COMMAND:|$)/i);
    const fixMatch = text.match(/FIX_COMMAND:\s*([\s\S]*?)(?=EXPLANATION:|$)/i);
    const expMatch = text.match(/EXPLANATION:\s*([\s\S]*)/i);

    if (reasonMatch) reason = reasonMatch[1].trim();
    if (fixMatch) fixCommand = fixMatch[1].trim().replace(/^`+|`+$/g, '');
    if (expMatch) explanation = expMatch[1].trim();

    if (!fixCommand) {
      const codeBlockMatch = text.match(/```(?:bash|sh)?\n([\s\S]*?)\n```/);
      if (codeBlockMatch) fixCommand = codeBlockMatch[1].trim();
    }

    res.json({
      reason: reason || 'Command failed with an error',
      fixCommand: fixCommand || '',
      explanation,
      rawReply: text
    });
  } catch (err: any) {
    console.error('[Gemini AI fix error]:', err);
    res.status(500).json({ error: err.message || 'Failed to analyze error' });
  }
});

// AI Chat
app.post('/api/ai/chat', async (req, res) => {
  const { message, history, apiKey } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    let contextHistory = '';
    if (Array.isArray(history) && history.length > 0) {
      contextHistory = history.slice(-6).map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
    }

    const prompt = `${contextHistory ? `Previous conversation:\n${contextHistory}\n\n` : ''}User: ${message}
Current working directory: ${currentWorkingDir}

Help the user with their Ubuntu terminal, Linux commands, servers (PaperMC, Geyser, Docker, scripts, package management) or any task. If you give a terminal command, wrap it in a single markdown code block like \`\`\`bash\ncommand\n\`\`\` so they can 1-tap execute it. Keep answers concise, clear, and mobile-friendly.`;

    const text = await callGeminiAi(prompt, 'You are an intelligent, friendly Ubuntu Linux and server assistant on mobile. You answer questions directly and provide exact terminal commands.', apiKey);

    res.json({ reply: text });
  } catch (err: any) {
    console.error('[Gemini AI chat error]:', err);
    res.status(500).json({ error: err.message || 'AI chat failed' });
  }
});

// 3. System Processes & Hardware Details (RDP Process Inspector)
app.get('/api/system/processes', async (req, res) => {
  // Execute ps command to get real running processes
  const psCmd = 'ps -eo pid,user,%cpu,%mem,vsz,rss,stat,start,time,comm,args --sort=-%cpu';

  exec(psCmd, (err, stdout) => {
    const processes: any[] = [];
    if (!err && stdout) {
      const lines = stdout.trim().split('\n');
      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        if (parts.length >= 10) {
          const pid = parseInt(parts[0], 10);
          const user = parts[1];
          const cpu = parseFloat(parts[2]);
          const mem = parseFloat(parts[3]);
          const vsz = parseInt(parts[4], 10);
          const rss = parseInt(parts[5], 10);
          const stat = parts[6];
          const start = parts[7];
          const time = parts[8];
          const comm = parts[9];
          const args = parts.slice(10).join(' ') || comm;

          // Categorize background scripts and processes
          const cmdLower = (args || comm).toLowerCase();
          let isScript = false;
          let scriptType: 'shell' | 'python' | 'node' | 'java' | 'package' | 'other' = 'other';
          let scriptName = comm;

          if (cmdLower.includes('.sh') || comm === 'bash' || comm === 'sh' || comm === 'zsh') {
            isScript = true;
            scriptType = 'shell';
            const match = args.match(/([a-zA-Z0-9_\-./]+\.sh)/);
            scriptName = match ? (match[1].split('/').pop() || match[1]) : (comm === 'bash' ? 'bash script/session' : 'sh script');
          } else if (cmdLower.includes('.py') || comm.includes('python')) {
            isScript = true;
            scriptType = 'python';
            const match = args.match(/([a-zA-Z0-9_\-./]+\.py)/);
            scriptName = match ? (match[1].split('/').pop() || match[1]) : 'python process';
          } else if (cmdLower.includes('.js') || cmdLower.includes('.ts') || comm === 'node' || comm === 'npm' || comm === 'tsx') {
            isScript = true;
            scriptType = 'node';
            const match = args.match(/([a-zA-Z0-9_\-./]+\.(?:js|ts|mjs|cjs))/);
            scriptName = match ? (match[1].split('/').pop() || match[1]) : (comm === 'npm' ? 'npm runner' : 'node script');
          } else if (cmdLower.includes('java') || comm === 'java') {
            isScript = true;
            scriptType = 'java';
            const match = args.match(/([a-zA-Z0-9_\-./]+\.jar)/);
            scriptName = match ? (match[1].split('/').pop() || match[1]) : 'Java Server/App';
          } else if (cmdLower.includes('apt') || cmdLower.includes('dpkg') || cmdLower.includes('pip') || cmdLower.includes('git')) {
            isScript = true;
            scriptType = 'package';
            scriptName = comm;
          }

          processes.push({
            pid,
            user,
            cpu,
            mem,
            vszMb: +(vsz / 1024).toFixed(1),
            rssMb: +(rss / 1024).toFixed(1),
            stat,
            start,
            time,
            comm,
            command: args.slice(0, 200),
            isScript,
            scriptType,
            scriptName
          });
        }
      }
    }

    // Filter active scripts
    const activeScripts = processes.filter(p => p.isScript);

    // System Hardware Metrics
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = totalMemBytes - freeMemBytes;
    const memPercent = +((usedMemBytes / totalMemBytes) * 100).toFixed(1);

    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const uptime = os.uptime();

    res.json({
      processes,
      scripts: activeScripts,
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        distro: 'Ubuntu 22.04 LTS (Jammy Jellyfish)',
        arch: os.arch(),
        uptimeSeconds: Math.floor(uptime),
        memory: {
          totalMb: Math.round(totalMemBytes / (1024 * 1024)),
          usedMb: Math.round(usedMemBytes / (1024 * 1024)),
          freeMb: Math.round(freeMemBytes / (1024 * 1024)),
          percent: memPercent
        },
        cpu: {
          model: cpus.length > 0 ? cpus[0].model : 'AMD/Intel x86_64',
          cores: cpus.length,
          load1m: +loadAvg[0].toFixed(2),
          load5m: +loadAvg[1].toFixed(2),
          load15m: +loadAvg[2].toFixed(2)
        },
        container: IS_CONTAINER,
        workingDir: currentWorkingDir,
        activeScriptsCount: activeScripts.length
      }
    });
  });
});

// Process Deep Inspection (View CWD, CMDLINE, Status of any background script)
app.get('/api/system/process-inspect/:pid', (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  if (!pid) return res.status(400).json({ error: 'PID is required' });

  let cwd = '';
  let statusLines: Record<string, string> = {};
  let cmdline = '';

  try {
    if (fs.existsSync(`/proc/${pid}/cwd`)) {
      cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
    }
  } catch (e) {}

  try {
    if (fs.existsSync(`/proc/${pid}/status`)) {
      const raw = fs.readFileSync(`/proc/${pid}/status`, 'utf-8');
      raw.split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          statusLines[parts[0].trim()] = parts.slice(1).join(':').trim();
        }
      });
    }
  } catch (e) {}

  try {
    if (fs.existsSync(`/proc/${pid}/cmdline`)) {
      cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ').trim();
    }
  } catch (e) {}

  res.json({
    pid,
    cwd,
    cmdline,
    state: statusLines['State'] || 'Unknown',
    vmRSS: statusLines['VmRSS'] || 'Unknown',
    threads: statusLines['Threads'] || '1',
    user: statusLines['Uid'] || 'root'
  });
});

// 4. Kill Process (RDP Process Manager)
app.post('/api/system/process/kill', (req, res) => {
  const pid = parseInt(req.body.pid, 10);
  const signal = req.body.signal || 'SIGTERM';

  if (!pid || isNaN(pid) || pid <= 1) {
    return res.status(400).json({ error: 'Invalid or protected process ID' });
  }

  try {
    process.kill(pid, signal);
    res.json({ success: true, message: `Signal ${signal} sent to PID ${pid}` });
  } catch (err: any) {
    // If process.kill throws permission error, try exec sudo/kill
    exec(`kill -${signal === 'SIGKILL' ? '9' : '15'} ${pid}`, (killErr) => {
      if (killErr) {
        return res.status(500).json({ error: `Could not terminate PID ${pid}: ${killErr.message}` });
      }
      res.json({ success: true, message: `Process ${pid} terminated via shell kill` });
    });
  }
});

// -------------------------------------------------------------
// FILE MANAGER API ENDPOINTS (Cut, Copy, Delete, Edit, Zip, Extract, URL Download)
// -------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// 1. List directory
app.get('/api/fs/list', (req, res) => {
  let targetPath = (req.query.path as string) || currentWorkingDir || (IS_CONTAINER ? '/root' : process.cwd());
  targetPath = path.resolve(targetPath);

  if (!fs.existsSync(targetPath)) {
    targetPath = IS_CONTAINER ? '/root' : process.cwd();
  }

  try {
    const stats = fs.statSync(targetPath);
    if (!stats.isDirectory()) {
      targetPath = path.dirname(targetPath);
    }

    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    const items = entries.map(entry => {
      const fullPath = path.join(targetPath, entry.name);
      let sizeBytes = 0;
      let mtime = new Date().toISOString();
      let isDir = entry.isDirectory();

      try {
        const itemStat = fs.statSync(fullPath);
        sizeBytes = itemStat.size;
        mtime = itemStat.mtime.toISOString();
        isDir = itemStat.isDirectory();
      } catch (e) {}

      const ext = path.extname(entry.name).toLowerCase();
      const isArchive = ['.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z'].includes(ext) || entry.name.endsWith('.tar.gz');
      const isEditable = !isDir && (
        ['.txt', '.sh', '.py', '.js', '.ts', '.json', '.yml', '.yaml', '.properties', '.md', '.env', '.log', '.cfg', '.conf', '.html', '.css', '.xml'].includes(ext) ||
        sizeBytes < 500000 // Small unknown files can be opened in text editor
      );

      return {
        name: entry.name,
        path: fullPath,
        isDirectory: isDir,
        sizeBytes,
        sizeFormatted: isDir ? 'Folder' : formatBytes(sizeBytes),
        mtime,
        extension: ext,
        isArchive,
        isEditable
      };
    });

    // Sort folders first, then alphabetically
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    // Compute breadcrumbs
    const parts = targetPath.split(path.sep).filter(Boolean);
    const breadcrumbs: Array<{ name: string; path: string }> = [{ name: 'root', path: path.sep }];
    let acc = '';
    for (const part of parts) {
      acc += (acc === path.sep ? '' : path.sep) + part;
      breadcrumbs.push({ name: part, path: acc });
    }

    const parentPath = targetPath === path.sep ? null : path.dirname(targetPath);

    res.json({
      currentPath: targetPath,
      parentPath,
      breadcrumbs,
      items,
      totalFiles: items.filter(i => !i.isDirectory).length,
      totalFolders: items.filter(i => i.isDirectory).length
    });
  } catch (err: any) {
    res.status(500).json({ error: `Cannot read directory: ${err.message}` });
  }
});

// 2. Create file or folder
app.post('/api/fs/create', (req, res) => {
  const { currentPath, name, type } = req.body;
  if (!currentPath || !name) return res.status(400).json({ error: 'currentPath and name required' });

  const target = path.join(currentPath, name.trim());
  try {
    if (fs.existsSync(target)) {
      return res.status(400).json({ error: 'Item already exists' });
    }
    if (type === 'folder') {
      fs.mkdirSync(target, { recursive: true });
    } else {
      fs.writeFileSync(target, '', 'utf-8');
    }
    res.json({ success: true, path: target });
  } catch (err: any) {
    res.status(500).json({ error: `Creation failed: ${err.message}` });
  }
});

// 3. Delete file or folder
app.post('/api/fs/delete', (req, res) => {
  const { path: itemPath } = req.body;
  if (!itemPath) return res.status(400).json({ error: 'path required' });

  try {
    if (!fs.existsSync(itemPath)) {
      return res.status(404).json({ error: 'File or directory not found' });
    }
    fs.rmSync(itemPath, { recursive: true, force: true });
    res.json({ success: true, message: `Deleted ${path.basename(itemPath)}` });
  } catch (err: any) {
    res.status(500).json({ error: `Delete failed: ${err.message}` });
  }
});

// 4. Rename file or folder
app.post('/api/fs/rename', (req, res) => {
  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath required' });

  try {
    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({ error: 'Source not found' });
    }
    fs.renameSync(oldPath, newPath);
    res.json({ success: true, message: 'Renamed successfully' });
  } catch (err: any) {
    res.status(500).json({ error: `Rename failed: ${err.message}` });
  }
});

// 5. Copy file or folder
app.post('/api/fs/copy', (req, res) => {
  const { sourcePath, targetDir } = req.body;
  if (!sourcePath || !targetDir) return res.status(400).json({ error: 'sourcePath and targetDir required' });

  const dest = path.join(targetDir, path.basename(sourcePath));
  try {
    fs.cpSync(sourcePath, dest, { recursive: true });
    res.json({ success: true, message: `Copied to ${dest}` });
  } catch (err: any) {
    res.status(500).json({ error: `Copy failed: ${err.message}` });
  }
});

// 6. Move / Cut file or folder
app.post('/api/fs/move', (req, res) => {
  const { sourcePath, targetDir } = req.body;
  if (!sourcePath || !targetDir) return res.status(400).json({ error: 'sourcePath and targetDir required' });

  const dest = path.join(targetDir, path.basename(sourcePath));
  try {
    fs.renameSync(sourcePath, dest);
    res.json({ success: true, message: `Moved to ${dest}` });
  } catch (err: any) {
    // If cross-device, cp + rm
    try {
      fs.cpSync(sourcePath, dest, { recursive: true });
      fs.rmSync(sourcePath, { recursive: true, force: true });
      res.json({ success: true, message: `Moved to ${dest}` });
    } catch (e: any) {
      res.status(500).json({ error: `Move failed: ${err.message}` });
    }
  }
});

// 7. Read file content for editing
app.post('/api/fs/read', (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path required' });

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File is larger than 5MB limit for inline text editing' });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content, sizeBytes: stat.size, path: filePath });
  } catch (err: any) {
    res.status(500).json({ error: `Read failed: ${err.message}` });
  }
});

// 8. Write / Save file content
app.post('/api/fs/write', (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) return res.status(400).json({ error: 'path and content required' });

  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ success: true, message: 'Saved successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: `Save failed: ${err.message}` });
  }
});

// 9. Extract / Unzip archive (.zip, .tar.gz, .tar)
app.post('/api/fs/extract', (req, res) => {
  const { archivePath, targetDir } = req.body;
  if (!archivePath) return res.status(400).json({ error: 'archivePath required' });

  const dest = targetDir || path.dirname(archivePath);

  try {
    if (archivePath.endsWith('.zip')) {
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(dest, true);
      return res.json({ success: true, message: `Unzipped into ${dest}` });
    } else if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
      exec(`tar -xzf "${archivePath}" -C "${dest}"`, (err) => {
        if (err) return res.status(500).json({ error: `tar extraction failed: ${err.message}` });
        res.json({ success: true, message: `Extracted tar.gz into ${dest}` });
      });
    } else if (archivePath.endsWith('.tar')) {
      exec(`tar -xf "${archivePath}" -C "${dest}"`, (err) => {
        if (err) return res.status(500).json({ error: `tar extraction failed: ${err.message}` });
        res.json({ success: true, message: `Extracted tar into ${dest}` });
      });
    } else {
      // Fallback unzip command
      exec(`unzip -o -q "${archivePath}" -d "${dest}"`, (err) => {
        if (err) return res.status(500).json({ error: `Extraction failed: ${err.message}` });
        res.json({ success: true, message: `Extracted into ${dest}` });
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: `Extract failed: ${err.message}` });
  }
});

// 10. Zip / Compress folder or file
app.post('/api/fs/zip', (req, res) => {
  const { sourcePath, zipName } = req.body;
  if (!sourcePath) return res.status(400).json({ error: 'sourcePath required' });

  try {
    const stat = fs.statSync(sourcePath);
    const parentDir = path.dirname(sourcePath);
    const baseName = path.basename(sourcePath);
    const finalZipName = zipName ? (zipName.endsWith('.zip') ? zipName : `${zipName}.zip`) : `${baseName}.zip`;
    const destZipPath = path.join(parentDir, finalZipName);

    const zip = new AdmZip();
    if (stat.isDirectory()) {
      zip.addLocalFolder(sourcePath, baseName);
    } else {
      zip.addLocalFile(sourcePath);
    }
    zip.writeZip(destZipPath);
    res.json({ success: true, zipPath: destZipPath, message: `Created ${finalZipName}` });
  } catch (err: any) {
    res.status(500).json({ error: `Zip creation failed: ${err.message}` });
  }
});

// 11. Download file or folder (folders are zipped on-the-fly)
app.get('/api/fs/download', (req, res) => {
  const itemPath = req.query.path as string;
  if (!itemPath || !fs.existsSync(itemPath)) {
    return res.status(404).send('File not found');
  }

  try {
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      const zip = new AdmZip();
      zip.addLocalFolder(itemPath, path.basename(itemPath));
      const zipBuffer = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(itemPath)}.zip"`);
      res.send(zipBuffer);
    } else {
      res.download(itemPath);
    }
  } catch (err: any) {
    res.status(500).send(`Download failed: ${err.message}`);
  }
});

// 12. Download from GitHub URL or Direct Link into filesystem
app.post('/api/fs/download-url', async (req, res) => {
  let { url, targetDir, filename } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL required' });

  const destFolder = targetDir || currentWorkingDir || (IS_CONTAINER ? '/root' : process.cwd());
  if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { recursive: true });
  }

  // Handle GitHub raw conversion if needed (e.g. github.com/.../blob/... -> raw.githubusercontent.com)
  let cleanUrl = url.trim();
  if (cleanUrl.includes('github.com') && cleanUrl.includes('/blob/')) {
    cleanUrl = cleanUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  }

  // Compute filename
  if (!filename) {
    const parsedUrl = new URL(cleanUrl);
    filename = path.basename(parsedUrl.pathname) || `download-${Date.now()}`;
  }

  const destFile = path.join(destFolder, filename);

  try {
    // Use curl -L with progress for fastest and most reliable download
    exec(`curl -L -s -o "${destFile}" "${cleanUrl}"`, (err) => {
      if (err) {
        return res.status(500).json({ error: `Download failed: ${err.message}` });
      }

      if (fs.existsSync(destFile)) {
        const stat = fs.statSync(destFile);
        res.json({
          success: true,
          message: `Downloaded ${filename} successfully!`,
          savedPath: destFile,
          sizeFormatted: formatBytes(stat.size)
        });
      } else {
        res.status(500).json({ error: 'File was not saved' });
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: `Download error: ${err.message}` });
  }
});

// 5. PaperMC Status
app.get('/api/papermc/status', async (req, res) => {
  const jarInfo = getPaperJarInfo();
  const javaInfo = await getJavaVersion();
  const plugins = getInstalledPluginsList();
  const geyserInstalled = plugins.some(p => p.isGeyser);
  const floodgateInstalled = plugins.some(p => p.isFloodgate);

  // Read server.properties
  let serverProps: Record<string, string> = {};
  if (fs.existsSync(PROPERTIES_FILE)) {
    try {
      const content = fs.readFileSync(PROPERTIES_FILE, 'utf-8');
      content.split('\n').forEach(line => {
        const l = line.trim();
        if (l && !l.startsWith('#') && l.includes('=')) {
          const [k, ...v] = l.split('=');
          serverProps[k.trim()] = v.join('=').trim();
        }
      });
    } catch (e) {}
  }

  // Calculate uptime
  const uptimeSeconds = paperStartTime ? Math.floor((Date.now() - paperStartTime) / 1000) : 0;

  res.json({
    status: paperStatus,
    running: paperStatus === 'online' || paperStatus === 'starting',
    pid: paperProcess ? paperProcess.pid : null,
    uptimeSeconds,
    jarInfo,
    javaInfo,
    pluginsCount: plugins.length,
    geyserInstalled,
    floodgateInstalled,
    javaPort: parseInt(serverProps['server-port'] || '25565', 10),
    geyserPort: 19132,
    motd: serverProps['motd'] || 'PaperMC Bukkit Server',
    maxPlayers: parseInt(serverProps['max-players'] || '20', 10),
    difficulty: serverProps['difficulty'] || 'normal',
    gamemode: serverProps['gamemode'] || 'survival',
    onlineMode: serverProps['online-mode'] === 'true',
    eulaAccepted: fs.existsSync(EULA_FILE)
  });
});

// 6. PaperMC Install (Downloads latest official PaperMC build)
app.post('/api/papermc/install', async (req, res) => {
  const version = req.body.version || '1.21.4';
  addPaperLog(`[Installer] Starting download for PaperMC version ${version}...`, 'INFO');

  try {
    // Query PaperMC API to find the latest build for this version
    const apiUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}`;
    
    https.get(apiUrl, { headers: { 'User-Agent': 'Ubuntu-PaperMC-Installer/1.0' } }, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', async () => {
        try {
          let latestBuild = 0;
          if (apiRes.statusCode === 200) {
            const parsed = JSON.parse(data);
            if (parsed.builds && Array.isArray(parsed.builds) && parsed.builds.length > 0) {
              latestBuild = parsed.builds[parsed.builds.length - 1];
            }
          }

          const targetJarPath = path.join(PAPER_DIR, 'paper.jar');
          let downloadUrl = '';

          if (latestBuild > 0) {
            downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}/downloads/paper-${version}-${latestBuild}.jar`;
            addPaperLog(`[Installer] Found latest PaperMC build #${latestBuild}. Downloading from ${downloadUrl}...`, 'INFO');
          } else {
            // Fallback direct release URL
            downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/1.21.4/builds/164/downloads/paper-1.21.4-164.jar`;
            addPaperLog(`[Installer] Using direct PaperMC 1.21.4 release URL...`, 'INFO');
          }

          await downloadFile(downloadUrl, targetJarPath);
          fs.writeFileSync(EULA_FILE, 'eula=true\n', 'utf-8');
          addPaperLog(`[Installer] PaperMC successfully installed to ${targetJarPath}!`, 'INFO');
          res.json({
            success: true,
            message: `PaperMC ${version} build #${latestBuild || 'latest'} installed successfully!`,
            jarPath: targetJarPath
          });
        } catch (downloadErr: any) {
          addPaperLog(`[Installer Error] ${downloadErr.message}`, 'ERROR');
          res.status(500).json({ error: `PaperMC download failed: ${downloadErr.message}` });
        }
      });
    }).on('error', (err) => {
      addPaperLog(`[Installer Error] API request failed: ${err.message}`, 'ERROR');
      res.status(500).json({ error: `PaperMC API unreachable: ${err.message}` });
    });
  } catch (err: any) {
    res.status(500).json({ error: `Installation failed: ${err.message}` });
  }
});

// 7. Start PaperMC Server
app.post('/api/papermc/start', (req, res) => {
  if (paperStatus === 'online' || paperStatus === 'starting') {
    return res.status(400).json({ error: 'PaperMC server is already running or starting.' });
  }

  const jarInfo = getPaperJarInfo();
  if (!jarInfo.exists || !jarInfo.filename) {
    return res.status(400).json({ error: 'PaperMC jar not found. Please click "Install PaperMC" first.' });
  }

  paperStatus = 'starting';
  paperStartTime = Date.now();
  const jarPath = path.join(PAPER_DIR, jarInfo.filename);
  const memory = req.body.memoryMb ? `${req.body.memoryMb}M` : '2G';

  addPaperLog(`[PaperMC] Launching Java PaperMC server (${jarInfo.filename}) with -Xms1G -Xmx${memory}...`, 'INFO');

  // Spawn java process
  const javaBin = fs.existsSync('/opt/java/bin/java') ? '/opt/java/bin/java' : 'java';
  const javaArgs = [
    '-Xms1G',
    `-Xmx${memory}`,
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    '-jar',
    jarPath,
    '--nogui'
  ];

  try {
    paperProcess = spawn(javaBin, javaArgs, {
      cwd: PAPER_DIR,
      env: {
        ...process.env,
        PATH: `/opt/java/bin:${process.env.PATH}:/usr/local/bin:/usr/bin:/bin`
      }
    });

    paperProcess.stdout?.on('data', (data) => {
      const text = data.toString('utf-8');
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        addPaperLog(line, 'INFO');
        // Check for server ready flag
        if (line.includes('Done (') && line.includes(')! For help, type "help"')) {
          paperStatus = 'online';
        }
        if (line.includes('[Geyser-Spigot] Started Bedrock listener')) {
          addPaperLog('[GeyserMC Bridge] Bedrock UDP listener active on port 19132!', 'INFO');
        }
      }
    });

    paperProcess.stderr?.on('data', (data) => {
      const text = data.toString('utf-8');
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        addPaperLog(line, 'WARN');
      }
    });

    paperProcess.on('close', (code) => {
      addPaperLog(`[PaperMC] Server process exited with code ${code}`, code === 0 ? 'INFO' : 'WARN');
      paperStatus = 'offline';
      paperProcess = null;
      paperStartTime = null;
    });

    paperProcess.on('error', (err) => {
      addPaperLog(`[PaperMC] Process error: ${err.message}`, 'ERROR');
      paperStatus = 'offline';
      paperProcess = null;
      paperStartTime = null;
    });

    // Assume online after 5 seconds if no crash
    setTimeout(() => {
      if (paperStatus === 'starting') {
        paperStatus = 'online';
      }
    }, 5000);

    res.json({ success: true, message: 'PaperMC server started successfully', pid: paperProcess.pid });
  } catch (err: any) {
    paperStatus = 'offline';
    paperProcess = null;
    paperStartTime = null;
    res.status(500).json({ error: `Failed to spawn Java server: ${err.message}` });
  }
});

// 8. Stop PaperMC Server
app.post('/api/papermc/stop', (req, res) => {
  if (!paperProcess || paperStatus === 'offline') {
    paperStatus = 'offline';
    return res.json({ success: true, message: 'Server is already offline' });
  }

  paperStatus = 'stopping';
  addPaperLog('[PaperMC] Stopping server gracefully via "stop" command...', 'INFO');

  try {
    paperProcess.stdin?.write('stop\n');
  } catch (e) {}

  setTimeout(() => {
    if (paperProcess) {
      try {
        paperProcess.kill('SIGTERM');
      } catch (e) {}
    }
  }, 8000);

  res.json({ success: true, message: 'PaperMC stop command dispatched' });
});

// 9. Restart PaperMC Server
app.post('/api/papermc/restart', (req, res) => {
  if (paperProcess) {
    try {
      paperProcess.stdin?.write('stop\n');
      setTimeout(() => {
        try {
          if (paperProcess) paperProcess.kill('SIGKILL');
        } catch (e) {}
      }, 5000);
    } catch (e) {}
  }
  paperStatus = 'offline';
  paperProcess = null;

  setTimeout(() => {
    // Trigger start
    const jarInfo = getPaperJarInfo();
    if (jarInfo.exists && jarInfo.filename) {
      const jarPath = path.join(PAPER_DIR, jarInfo.filename);
      const javaBin = fs.existsSync('/opt/java/bin/java') ? '/opt/java/bin/java' : 'java';
      paperStatus = 'starting';
      paperStartTime = Date.now();
      paperProcess = spawn(javaBin, ['-Xms1G', '-Xmx2G', '-jar', jarPath, '--nogui'], { cwd: PAPER_DIR });
      paperProcess.on('close', () => { paperStatus = 'offline'; paperProcess = null; });
    }
  }, 6000);

  res.json({ success: true, message: 'Server restarting...' });
});

// 10. Send Bukkit/Minecraft Command to PaperMC Console
app.post('/api/papermc/command', (req, res) => {
  const cmd = req.body.command;
  if (!cmd || typeof cmd !== 'string') {
    return res.status(400).json({ error: 'Command string is required' });
  }

  addPaperLog(`> ${cmd}`, 'COMMAND');

  if (!paperProcess || !paperProcess.stdin) {
    return res.status(400).json({ error: 'PaperMC server is not running. Start the server first.' });
  }

  try {
    paperProcess.stdin.write(`${cmd.trim()}\n`);
    res.json({ success: true, command: cmd });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to write to stdin: ${err.message}` });
  }
});

// 11. Get PaperMC Console Logs
app.get('/api/papermc/logs', (req, res) => {
  res.json({ logs: paperLogs });
});

app.post('/api/papermc/logs/clear', (req, res) => {
  paperLogs.length = 0;
  res.json({ success: true });
});

// 12. GeyserMC & Floodgate 1-Click Installer
app.post('/api/geysermc/install', async (req, res) => {
  addPaperLog('[GeyserMC] Starting download for Geyser-Spigot and Floodgate plugins...', 'INFO');

  const geyserDest = path.join(PLUGINS_DIR, 'Geyser-Spigot.jar');
  const floodgateDest = path.join(PLUGINS_DIR, 'Floodgate-Spigot.jar');

  try {
    // 1. Download Geyser
    addPaperLog('[GeyserMC] Downloading Geyser-Spigot.jar (Bedrock crossplay bridge)...', 'INFO');
    await downloadFile('https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot', geyserDest);
    addPaperLog('[GeyserMC] Geyser-Spigot.jar installed successfully!', 'INFO');

    // 2. Download Floodgate
    addPaperLog('[Floodgate] Downloading Floodgate-Spigot.jar (Bedrock authentication & skins)...', 'INFO');
    try {
      await downloadFile('https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot', floodgateDest);
      addPaperLog('[Floodgate] Floodgate-Spigot.jar installed successfully!', 'INFO');
    } catch (fgErr) {
      addPaperLog(`[Floodgate Note] Floodgate download skipped: ${fgErr}`, 'WARN');
    }

    res.json({
      success: true,
      message: 'GeyserMC & Floodgate plugins installed into /plugins! Restart PaperMC to activate.'
    });
  } catch (err: any) {
    addPaperLog(`[GeyserMC Error] Installation failed: ${err.message}`, 'ERROR');
    res.status(500).json({ error: `GeyserMC installation failed: ${err.message}` });
  }
});

// 13. Plugin Catalog & Installed Plugins List
app.get('/api/plugins/list', (req, res) => {
  const installed = getInstalledPluginsList();
  const catalog = PLUGIN_CATALOG.map(item => {
    const isInstalled = installed.some(p => p.filename.toLowerCase().startsWith(item.id.toLowerCase()) || p.name.toLowerCase().includes(item.id.toLowerCase()));
    return {
      ...item,
      installed: isInstalled
    };
  });

  res.json({
    installed,
    catalog
  });
});

// 14. 1-Click Install Plugin from Catalog
app.post('/api/plugins/install', async (req, res) => {
  const pluginId = req.body.pluginId;
  const plugin = PLUGIN_CATALOG.find(p => p.id === pluginId);

  if (!plugin) {
    return res.status(404).json({ error: `Plugin with ID "${pluginId}" not found in catalog.` });
  }

  const destPath = path.join(PLUGINS_DIR, plugin.filename);
  addPaperLog(`[Plugin Manager] Downloading ${plugin.name} to ${destPath}...`, 'INFO');

  try {
    await downloadFile(plugin.downloadUrl, destPath);
    addPaperLog(`[Plugin Manager] ${plugin.name} installed successfully!`, 'INFO');
    res.json({
      success: true,
      message: `${plugin.name} installed into /plugins! Restart the server to load it.`
    });
  } catch (err: any) {
    addPaperLog(`[Plugin Error] Failed to download ${plugin.name}: ${err.message}`, 'ERROR');
    res.status(500).json({ error: `Download failed: ${err.message}` });
  }
});

// 15. Toggle Plugin (Enable / Disable)
app.post('/api/plugins/toggle', (req, res) => {
  const filename = req.body.filename;
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Filename is required' });
  }

  const cleanFilename = path.basename(filename);
  const currentPath = path.join(PLUGINS_DIR, cleanFilename);

  if (!fs.existsSync(currentPath)) {
    return res.status(404).json({ error: 'Plugin file not found' });
  }

  try {
    let newPath = '';
    if (cleanFilename.endsWith('.disabled')) {
      newPath = path.join(PLUGINS_DIR, cleanFilename.replace('.disabled', ''));
    } else {
      newPath = path.join(PLUGINS_DIR, `${cleanFilename}.disabled`);
    }
    fs.renameSync(currentPath, newPath);
    res.json({ success: true, enabled: !newPath.endsWith('.disabled') });
  } catch (err: any) {
    res.status(500).json({ error: `Could not toggle plugin: ${err.message}` });
  }
});

// 16. Delete Plugin
app.post('/api/plugins/delete', (req, res) => {
  const filename = req.body.filename;
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Filename is required' });
  }

  const cleanFilename = path.basename(filename);
  const targetPath = path.join(PLUGINS_DIR, cleanFilename);

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'Plugin file not found' });
  }

  try {
    fs.unlinkSync(targetPath);
    addPaperLog(`[Plugin Manager] Deleted plugin ${cleanFilename}`, 'INFO');
    res.json({ success: true, message: `Deleted ${cleanFilename}` });
  } catch (err: any) {
    res.status(500).json({ error: `Delete failed: ${err.message}` });
  }
});

// 17. Server Properties (Read & Update)
app.get('/api/papermc/properties', (req, res) => {
  if (!fs.existsSync(PROPERTIES_FILE)) {
    return res.json({ properties: {} });
  }
  const content = fs.readFileSync(PROPERTIES_FILE, 'utf-8');
  const properties: Record<string, string> = {};
  content.split('\n').forEach(line => {
    const l = line.trim();
    if (l && !l.startsWith('#') && l.includes('=')) {
      const [k, ...v] = l.split('=');
      properties[k.trim()] = v.join('=').trim();
    }
  });
  res.json({ properties });
});

app.post('/api/papermc/properties', (req, res) => {
  const newProps = req.body.properties;
  if (!newProps || typeof newProps !== 'object') {
    return res.status(400).json({ error: 'Properties object is required' });
  }

  try {
    let output = '# Minecraft PaperMC Server Properties\n';
    for (const [k, v] of Object.entries(newProps)) {
      output += `${k}=${v}\n`;
    }
    fs.writeFileSync(PROPERTIES_FILE, output, 'utf-8');
    res.json({ success: true, message: 'server.properties updated successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to save properties: ${err.message}` });
  }
});

// 18. Legacy /api/status route for backwards-compatibility
app.get('/api/status', async (req, res) => {
  const jarInfo = getPaperJarInfo();
  const plugins = getInstalledPluginsList();
  const geyserInstalled = plugins.some(p => p.isGeyser);

  res.json({
    status: paperStatus,
    serverName: 'PaperMC Bukkit Server',
    version: jarInfo.exists ? 'PaperMC 1.21.x (Java 21)' : 'Not Installed',
    bedrockPort: 19132,
    javaPort: 25565,
    tps: 20.0,
    geyserActive: geyserInstalled,
    desktopUrl: 'http://localhost:6080',
    uptimeSeconds: paperStartTime ? Math.floor((Date.now() - paperStartTime) / 1000) : 0
  });
});

app.get('/api/logs', (req, res) => {
  res.json({ logs: paperLogs });
});

// -------------------------------------------------------------
// Production Static HTML Serve / Dev Vite Middleware
// -------------------------------------------------------------
async function start() {
  const distPath = path.join(process.cwd(), 'dist');

  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('[Vite Warning] Falling back to static files:', err);
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Ubuntu RDP & PaperMC Terminal Panel] Listening on http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
