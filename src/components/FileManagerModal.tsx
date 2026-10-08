import React, { useState, useEffect } from 'react';
import { 
  Folder, File, FileText, FileCode, Archive, Download, Upload, Trash2, 
  Scissors, Copy, CornerDownRight, Edit3, X, RefreshCw, Plus, ArrowUp, 
  Globe, Check, AlertCircle, Save, ExternalLink, ChevronRight, MoreVertical 
} from 'lucide-react';
import { FsItem, FsDirectoryResponse } from '../types';

interface FileManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPath?: string;
  onExecuteCommand?: (command: string) => void;
}

interface ClipboardState {
  sourcePath: string;
  name: string;
  action: 'cut' | 'copy';
}

export const FileManagerModal: React.FC<FileManagerModalProps> = ({
  isOpen,
  onClose,
  initialPath,
  onExecuteCommand
}) => {
  const [currentPath, setCurrentPath] = useState(initialPath || '/root');
  const [dirData, setDirData] = useState<FsDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Clipboard (Cut / Copy / Paste)
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

  // Modal Sub-States
  const [editingFile, setEditingFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [newEntityName, setNewEntityName] = useState('');

  // Rename state
  const [renamingItem, setRenamingItem] = useState<{ path: string; oldName: string; newName: string } | null>(null);

  // GitHub / Direct URL Download modal
  const [isUrlDownloadOpen, setIsUrlDownloadOpen] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [customFilename, setCustomFilename] = useState('');
  const [urlDownloading, setUrlDownloading] = useState(false);

  // Item Action Sheet for mobile
  const [selectedItemAction, setSelectedItemAction] = useState<FsItem | null>(null);

  // Fetch Directory Items
  const fetchDirectory = async (targetPath: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(targetPath)}`);
      const data = await res.json();
      if (res.ok) {
        setDirData(data);
        setCurrentPath(data.currentPath);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDirectory(currentPath);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 1. Create File or Folder
  const handleCreateEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntityName.trim() || !creatingType) return;

    try {
      const res = await fetch('/api/fs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPath,
          name: newEntityName.trim(),
          type: creatingType
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Created ${newEntityName}` });
        setCreatingType(null);
        setNewEntityName('');
        await fetchDirectory(currentPath);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  // 2. Delete
  const handleDelete = async (itemPath: string) => {
    if (!window.confirm(`Delete ${itemPath.split('/').pop()}?`)) return;
    try {
      const res = await fetch('/api/fs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: itemPath })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        setSelectedItemAction(null);
        await fetchDirectory(currentPath);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  // 3. Rename
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingItem || !renamingItem.newName.trim()) return;

    const parent = renamingItem.path.substring(0, renamingItem.path.lastIndexOf('/'));
    const newPath = `${parent}/${renamingItem.newName.trim()}`;

    try {
      const res = await fetch('/api/fs/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: renamingItem.path, newPath })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Renamed successfully' });
        setRenamingItem(null);
        setSelectedItemAction(null);
        await fetchDirectory(currentPath);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  // 4. Paste (Handles Cut / Copy)
  const handlePaste = async () => {
    if (!clipboard) return;
    const endpoint = clipboard.action === 'cut' ? '/api/fs/move' : '/api/fs/copy';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: clipboard.sourcePath,
          targetDir: currentPath
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        setClipboard(null);
        await fetchDirectory(currentPath);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  // 5. Open File for Editing
  const handleOpenFileEditor = async (item: FsItem) => {
    try {
      const res = await fetch('/api/fs/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: item.path })
      });
      const data = await res.json();
      if (res.ok) {
        setEditingFile({ path: item.path, name: item.name, content: data.content });
        setSelectedItemAction(null);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  // 6. Save File Content
  const handleSaveFileContent = async () => {
    if (!editingFile) return;
    setEditSaving(true);
    try {
      const res = await fetch('/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editingFile.path, content: editingFile.content })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Saved ${editingFile.name}!` });
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setEditSaving(false);
    }
  };

  // 7. Extract Archive (.zip, .tar.gz)
  const handleExtractArchive = async (itemPath: string) => {
    try {
      const res = await fetch('/api/fs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivePath: itemPath, targetDir: currentPath })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        setSelectedItemAction(null);
        await fetchDirectory(currentPath);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  // 8. Zip / Compress
  const handleZipItem = async (itemPath: string) => {
    try {
      const res = await fetch('/api/fs/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: itemPath })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        setSelectedItemAction(null);
        await fetchDirectory(currentPath);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  // 9. Download from GitHub URL / Direct Link
  const handleDownloadFromUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!downloadUrl.trim() || urlDownloading) return;

    setUrlDownloading(true);
    try {
      const res = await fetch('/api/fs/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: downloadUrl.trim(),
          targetDir: currentPath,
          filename: customFilename.trim() || undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        setDownloadUrl('');
        setCustomFilename('');
        setIsUrlDownloadOpen(false);
        await fetchDirectory(currentPath);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setUrlDownloading(false);
    }
  };

  const filteredItems = (dirData?.items || []).filter(item => {
    if (!search.trim()) return true;
    return item.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#0e0e14] border-t sm:border border-zinc-800 rounded-t-2xl sm:rounded-2xl max-w-xl w-full max-h-[92dvh] h-[88dvh] flex flex-col overflow-hidden shadow-2xl font-mono text-xs">
        {/* Top Header */}
        <div className="bg-[#14141c] p-3.5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-600 flex items-center justify-center text-white shadow-md">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white text-xs block">
                Ubuntu File Manager
              </span>
              <span className="text-[10px] text-zinc-400 truncate max-w-[200px] block">
                {currentPath}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchDirectory(currentPath)}
              disabled={loading}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Breadcrumb Path & Quick Navigation Bar */}
        <div className="bg-zinc-950 p-2 border-b border-zinc-800 flex items-center gap-1 overflow-x-auto no-scrollbar text-[11px] text-zinc-300">
          {dirData?.parentPath && (
            <button
              onClick={() => fetchDirectory(dirData.parentPath!)}
              className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 shrink-0"
              title="Go Up"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Quick Jumps */}
          <button
            onClick={() => fetchDirectory('/root')}
            className={`px-2 py-0.5 rounded text-[10px] shrink-0 border ${
              currentPath === '/root' ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
            }`}
          >
            ~ (root)
          </button>
          <button
            onClick={() => fetchDirectory('/app')}
            className={`px-2 py-0.5 rounded text-[10px] shrink-0 border ${
              currentPath === '/app' ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
            }`}
          >
            /app
          </button>
          <button
            onClick={() => fetchDirectory('/minecraft-paper')}
            className={`px-2 py-0.5 rounded text-[10px] shrink-0 border ${
              currentPath.startsWith('/minecraft-paper') ? 'bg-purple-950 text-purple-300 border-purple-800' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
            }`}
          >
            PaperMC
          </button>
          <button
            onClick={() => fetchDirectory('/tmp')}
            className="px-2 py-0.5 rounded text-[10px] shrink-0 bg-zinc-900 text-zinc-400 border border-zinc-800"
          >
            /tmp
          </button>
        </div>

        {/* Toolbar: Actions, New, GitHub Download, Search */}
        <div className="bg-[#121218] p-2 border-b border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => {
                setCreatingType('file');
                setNewEntityName('');
              }}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold flex items-center gap-1 transition"
            >
              <Plus className="w-3 h-3 text-emerald-400" />
              <span>File</span>
            </button>

            <button
              onClick={() => {
                setCreatingType('folder');
                setNewEntityName('');
              }}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold flex items-center gap-1 transition"
            >
              <Plus className="w-3 h-3 text-amber-400" />
              <span>Folder</span>
            </button>

            {/* GitHub / URL Download Button */}
            <button
              onClick={() => setIsUrlDownloadOpen(true)}
              className="px-2.5 py-1 rounded bg-gradient-to-r from-sky-700 to-indigo-700 hover:opacity-90 text-white text-[11px] font-bold flex items-center gap-1 transition shadow-sm"
              title="Download file from GitHub or direct link"
            >
              <Globe className="w-3 h-3" />
              <span>GitHub / URL</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex-1 min-w-[130px] max-w-[200px]">
            <input
              type="text"
              placeholder="Filter files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Clipboard Bar (Active when user clicks Cut or Copy) */}
        {clipboard && (
          <div className="bg-amber-950/60 border-b border-amber-800/80 p-2 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-200 truncate">
              {clipboard.action === 'cut' ? <Scissors className="w-3.5 h-3.5 text-rose-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
              <span className="truncate">
                {clipboard.action === 'cut' ? 'Cut' : 'Copied'}: <strong>{clipboard.name}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handlePaste}
                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold text-[11px] flex items-center gap-1"
              >
                <span>Paste Here</span>
              </button>
              <button
                onClick={() => setClipboard(null)}
                className="p-1 text-zinc-400 hover:text-white"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Notification Toast */}
        {message && (
          <div className={`p-2 border-b flex items-center justify-between text-[11px] ${
            message.type === 'success' ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200' : 'bg-rose-950/80 border-rose-800 text-rose-200'
          }`}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-zinc-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Modal: Create File / Folder Form */}
        {creatingType && (
          <form onSubmit={handleCreateEntity} className="p-2.5 bg-zinc-900 border-b border-zinc-800 flex items-center gap-2">
            <span className="text-zinc-300 font-bold text-[11px]">
              New {creatingType}:
            </span>
            <input
              type="text"
              autoFocus
              value={newEntityName}
              onChange={(e) => setNewEntityName(e.target.value)}
              placeholder={creatingType === 'file' ? 'script.sh, config.json...' : 'folder-name...'}
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px]"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setCreatingType(null)}
              className="px-2 py-1 text-zinc-400 hover:text-white text-[11px]"
            >
              Cancel
            </button>
          </form>
        )}

        {/* Files & Folders List Area */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-900 select-text">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 italic">
              {loading ? 'Reading folder...' : 'Folder is empty.'}
            </div>
          ) : (
            filteredItems.map((item) => {
              const isSh = item.extension === '.sh';
              const isPy = item.extension === '.py';
              const isJs = ['.js', '.ts', '.mjs'].includes(item.extension);
              const isArchive = item.isArchive;

              return (
                <div
                  key={item.path}
                  className="p-2.5 hover:bg-zinc-900/50 flex items-center justify-between gap-2"
                >
                  {/* Left: Icon & Name */}
                  <div
                    onClick={() => {
                      if (item.isDirectory) {
                        fetchDirectory(item.path);
                      } else if (item.isEditable) {
                        handleOpenFileEditor(item);
                      } else {
                        setSelectedItemAction(item);
                      }
                    }}
                    className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="shrink-0">
                      {item.isDirectory ? (
                        <Folder className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                      ) : isArchive ? (
                        <Archive className="w-4 h-4 text-purple-400" />
                      ) : isSh ? (
                        <FileCode className="w-4 h-4 text-emerald-400" />
                      ) : isPy ? (
                        <FileCode className="w-4 h-4 text-sky-400" />
                      ) : isJs ? (
                        <FileCode className="w-4 h-4 text-amber-300" />
                      ) : (
                        <FileText className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="font-medium text-zinc-200 text-xs truncate" title={item.name}>
                        {item.name}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {item.sizeFormatted} • {new Date(item.mtime).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {/* Right Action Menu Button */}
                  <div className="flex items-center gap-1 shrink-0">
                    {item.isEditable && (
                      <button
                        onClick={() => handleOpenFileEditor(item)}
                        className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
                        title="Edit File"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedItemAction(item)}
                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
                      title="Item Actions"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Statistics */}
        <div className="p-2.5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
          <span>{dirData?.totalFolders || 0} folders, {dirData?.totalFiles || 0} files</span>
          <button
            onClick={() => {
              if (onExecuteCommand) onExecuteCommand(`cd "${currentPath}"`);
              onClose();
            }}
            className="text-amber-400 hover:underline flex items-center gap-1 font-bold"
          >
            <span>Open in Terminal</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* MODAL 1: In-App File Text Editor */}
      {editingFile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center p-2 sm:p-4 font-mono text-xs">
          <div className="bg-[#0e0e14] border border-zinc-800 rounded-xl w-full max-w-2xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-3 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <FileCode className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-bold text-white text-xs truncate">
                  Editing: {editingFile.name}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleSaveFileContent}
                  disabled={editSaving}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editSaving ? 'Saving...' : 'Save'}</span>
                </button>
                <button
                  onClick={() => setEditingFile(null)}
                  className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <textarea
              value={editingFile.content}
              onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
              className="flex-1 w-full p-3 bg-[#0a0a0f] text-zinc-200 font-mono text-xs leading-relaxed resize-none focus:outline-none overflow-y-auto"
              spellCheck="false"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
        </div>
      )}

      {/* MODAL 2: Item Action Sheet (Cut, Copy, Delete, Rename, Zip, Extract, Download) */}
      {selectedItemAction && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 font-mono text-xs">
          <div className="bg-[#12121a] border-t sm:border border-zinc-800 rounded-t-2xl sm:rounded-2xl max-w-sm w-full p-4 space-y-3 shadow-2xl animate-in slide-in-from-bottom-5">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="font-bold text-white truncate max-w-[220px]">
                {selectedItemAction.name}
              </span>
              <button onClick={() => setSelectedItemAction(null)} className="p-1 text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Cut (Move) */}
              <button
                onClick={() => {
                  setClipboard({ sourcePath: selectedItemAction.path, name: selectedItemAction.name, action: 'cut' });
                  setSelectedItemAction(null);
                }}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 flex items-center gap-2"
              >
                <Scissors className="w-3.5 h-3.5 text-rose-400" />
                <span>Cut (Move)</span>
              </button>

              {/* Copy */}
              <button
                onClick={() => {
                  setClipboard({ sourcePath: selectedItemAction.path, name: selectedItemAction.name, action: 'copy' });
                  setSelectedItemAction(null);
                }}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 flex items-center gap-2"
              >
                <Copy className="w-3.5 h-3.5 text-sky-400" />
                <span>Copy</span>
              </button>

              {/* Rename */}
              <button
                onClick={() => {
                  setRenamingItem({ path: selectedItemAction.path, oldName: selectedItemAction.name, newName: selectedItemAction.name });
                  setSelectedItemAction(null);
                }}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 flex items-center gap-2"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                <span>Rename</span>
              </button>

              {/* Zip / Compress */}
              <button
                onClick={() => handleZipItem(selectedItemAction.path)}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 flex items-center gap-2"
              >
                <Archive className="w-3.5 h-3.5 text-purple-400" />
                <span>Zip File</span>
              </button>

              {/* Extract (if archive) */}
              {selectedItemAction.isArchive && (
                <button
                  onClick={() => handleExtractArchive(selectedItemAction.path)}
                  className="p-2 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800 flex items-center gap-2 col-span-2 font-bold"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Extract / Unzip Here</span>
                </button>
              )}

              {/* Edit (if editable) */}
              {selectedItemAction.isEditable && (
                <button
                  onClick={() => handleOpenFileEditor(selectedItemAction)}
                  className="p-2 rounded-lg bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800 flex items-center gap-2 col-span-2 font-bold"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit File</span>
                </button>
              )}

              {/* Direct Browser Download */}
              <a
                href={`/api/fs/download?path=${encodeURIComponent(selectedItemAction.path)}`}
                download
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download</span>
              </a>

              {/* Delete */}
              <button
                onClick={() => handleDelete(selectedItemAction.path)}
                className="p-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Rename Item Dialog */}
      {renamingItem && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 font-mono text-xs">
          <form onSubmit={handleRenameSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 max-w-sm w-full space-y-3">
            <span className="font-bold text-white block">Rename: {renamingItem.oldName}</span>
            <input
              type="text"
              autoFocus
              value={renamingItem.newName}
              onChange={(e) => setRenamingItem({ ...renamingItem, newName: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenamingItem(null)}
                className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold"
              >
                Rename
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: GitHub / Direct URL Downloader */}
      {isUrlDownloadOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 font-mono text-xs">
          <form onSubmit={handleDownloadFromUrl} className="bg-[#12121a] border border-zinc-800 rounded-xl p-4 max-w-md w-full space-y-3 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-sky-400" />
                Download from GitHub / Direct URL
              </span>
              <button type="button" onClick={() => setIsUrlDownloadOpen(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Enter any GitHub Release link, raw file URL, or direct download link. It will download straight into <strong className="text-amber-400">{currentPath}</strong>.
            </p>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-300">File Download URL:</label>
              <input
                type="url"
                required
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                placeholder="https://github.com/user/repo/releases/download/.../file.zip"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white placeholder-zinc-600 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-300">Save As Filename (Optional):</label>
              <input
                type="text"
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                placeholder="Auto-detected from URL if left empty"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white placeholder-zinc-600 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsUrlDownloadOpen(false)}
                className="px-3 py-2 rounded bg-zinc-800 text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={urlDownloading || !downloadUrl.trim()}
                className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5"
              >
                {urlDownloading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{urlDownloading ? 'Downloading...' : 'Download File'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
