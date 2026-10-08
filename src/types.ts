export interface TerminalHistoryItem {
  id: string;
  command: string;
  output: string;
  error?: string;
  exitCode?: number | null;
  timestamp: string;
  cwd: string;
  durationMs: number;
}

export interface ProcessItem {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  vszMb: number;
  rssMb: number;
  stat: string;
  start: string;
  time: string;
  comm: string;
  command: string;
  isScript?: boolean;
  scriptType?: 'shell' | 'python' | 'node' | 'java' | 'package' | 'other';
  scriptName?: string;
}

export interface SystemMetrics {
  hostname: string;
  platform: string;
  distro: string;
  arch: string;
  uptimeSeconds: number;
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    percent: number;
  };
  cpu: {
    model: string;
    cores: number;
    load1m: number;
    load5m: number;
    load15m: number;
  };
  container: boolean;
  workingDir: string;
  activeScriptsCount?: number;
  disk?: {
    available: string;
    size: string;
  };
}

export interface PaperJarInfo {
  exists: boolean;
  filename: string | null;
  sizeMb: number;
  modifiedAt: string | null;
}

export interface JavaInfo {
  installed: boolean;
  version: string;
}

export interface PaperMCStatus {
  status: 'offline' | 'starting' | 'online' | 'stopping';
  running: boolean;
  pid: number | null;
  uptimeSeconds: number;
  jarInfo: PaperJarInfo;
  javaInfo: JavaInfo;
  pluginsCount: number;
  geyserInstalled: boolean;
  floodgateInstalled: boolean;
  javaPort: number;
  geyserPort: number;
  motd: string;
  maxPlayers: number;
  difficulty: string;
  gamemode: string;
  onlineMode: boolean;
  eulaAccepted: boolean;
}

export interface PaperLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'COMMAND';
  message: string;
}

export interface InstalledPlugin {
  filename: string;
  name: string;
  sizeMb: number;
  enabled: boolean;
  isGeyser: boolean;
  isFloodgate: boolean;
  modifiedAt: string;
}

export interface CatalogPlugin {
  id: string;
  name: string;
  filename: string;
  description: string;
  category: 'bridge' | 'auth' | 'utility' | 'admin' | 'world';
  downloadUrl: string;
  installed: boolean;
  isGeyser?: boolean;
  isFloodgate?: boolean;
}

export interface ServerProperties {
  [key: string]: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  command?: string;
  timestamp: string;
}

export interface FsItem {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  sizeFormatted: string;
  mtime: string;
  extension: string;
  isArchive: boolean;
  isEditable: boolean;
}

export interface FsBreadcrumb {
  name: string;
  path: string;
}

export interface FsDirectoryResponse {
  currentPath: string;
  parentPath: string | null;
  breadcrumbs: FsBreadcrumb[];
  items: FsItem[];
  totalFiles: number;
  totalFolders: number;
}

