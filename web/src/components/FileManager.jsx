import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronRight, Download, Edit3, File, FileArchive, FileCode2, FilePlus, Folder, FolderPlus, FolderUp, Home, MoreHorizontal,
  PackageOpen, RefreshCw, Save, Trash2, Upload, Archive, Pencil,
} from 'lucide-react';
import { get, post, put, upload, q } from '../lib/api.js';
import { bytes, dateTime } from '../lib/format.js';
import { Alert, Button, Card, Loading, Modal, ProgressBar, cx, useAction, useConfirm, useToast } from './ui.jsx';
import CodeEditor from './CodeEditor.jsx';

const ARCHIVE = /\.(zip|tar|tar\.gz|tgz|tar\.xz|tar\.zst|tar\.bz2)$/i;
const BINARY = /\.(exe|dll|so|pak|ucas|utoc|ark|arkprofile|arktribe|bin|png|jpg|jpeg|gz|zip|tar|tgz|xz|zst|7z|dat|db|sqlite|pdb|sig)$/i;

function iconFor(e) {
  if (e.type === 'dir') return <Folder className="size-4 text-ember-400" />;
  if (ARCHIVE.test(e.name)) return <FileArchive className="size-4 text-violet-300" />;
  if (/\.(ini|cfg|json|txt|log|sh|conf)$/i.test(e.name)) return <FileCode2 className="size-4 text-sky-300" />;
  return <File className="size-4 text-ink-400" />;
}

function RowMenu({ entry, actions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const items = [
    entry.type === 'file' && !BINARY.test(entry.name) && { label: 'Edit', icon: Edit3, fn: actions.edit },
    { label: entry.type === 'dir' ? 'Download (.tar.gz)' : 'Download', icon: Download, fn: actions.download },
    { label: 'Rename / move', icon: Pencil, fn: actions.rename },
    entry.type === 'file' && ARCHIVE.test(entry.name) && { label: 'Extract here', icon: PackageOpen, fn: actions.extract },
    { label: 'Delete', icon: Trash2, fn: actions.remove, danger: true },
  ].filter(Boolean);
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label="Actions" onClick={() => setOpen(!open)} className="rounded-md p-1.5 text-ink-300 hover:bg-ink-700 hover:text-ink-100"><MoreHorizontal className="size-4" /></button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-ink-600 bg-ink-800 py-1 shadow-xl shadow-black/40">
          {items.map((it) => (
            <button key={it.label} type="button" onClick={() => { setOpen(false); it.fn(entry); }}
              className={cx('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-ink-700', it.danger ? 'text-red-300' : 'text-ink-100')}>
              <it.icon className="size-4" />{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Browse/edit/upload files inside a root (rootType: 'server' | 'cluster').
 */
export default function FileManager({ rootType, rootId, initialPath = '', warning }) {
  const base = `/files/${rootType}/${rootId}`;
  const [path, setPath] = useState(initialPath);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [editor, setEditor] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, run] = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const fileInput = useRef(null);
  const folderInput = useRef(null);

  const load = useCallback(async (p = path) => {
    try {
      setError(null);
      const d = await get(`${base}/list?${q({ path: p })}`);
      setData(d);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
      setData(null);
    }
  }, [base, path]);

  useEffect(() => { load(path); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  const crumbs = path ? path.split('/') : [];
  const join = (name) => (path ? `${path}/${name}` : name);

  const openEntry = async (e) => {
    if (e.type === 'dir') { setPath(e.path); return; }
    if (BINARY.test(e.name)) { download(e); return; }
    edit(e);
  };

  const edit = (e) => run('open', async () => {
    const f = await get(`${base}/read?${q({ path: e.path })}`);
    setEditor({ path: e.path, name: e.name, content: f.content, original: f.content, encoding: f.encoding });
  });

  const saveEditor = useCallback(() => {
    if (!editor) return;
    run('save', async () => {
      await put(`${base}/write`, { path: editor.path, content: editor.content, encoding: editor.encoding });
      setEditor((ed) => ed && { ...ed, original: ed.content });
    }, 'File saved');
  }, [editor, base, run]);

  const download = (e) => { window.location.href = `/api${base}/download?${q({ path: e.path })}`; };

  const rename = async (e) => {
    const to = await confirm({ title: `Rename "${e.name}"`, message: 'New name, or a path relative to the root to move it.', input: true, defaultValue: e.path, confirmLabel: 'Rename' });
    if (!to || to === e.path) return;
    run('rename', async () => { await post(`${base}/rename`, { from: e.path, to }); await load(); }, 'Renamed');
  };

  const removePaths = async (paths) => {
    const ok = await confirm({ title: `Delete ${paths.length === 1 ? `"${paths[0].split('/').pop()}"` : `${paths.length} items`}?`, message: 'This cannot be undone.', danger: true, confirmLabel: 'Delete' });
    if (!ok) return;
    run('delete', async () => { await post(`${base}/delete`, { paths }); await load(); }, 'Deleted');
  };

  const extract = (e) => run('extract', async () => { await post(`${base}/extract`, { path: e.path }); await load(); }, 'Extracted');

  const mkdir = async () => {
    const name = await confirm({ title: 'New folder', input: true, placeholder: 'Folder name', confirmLabel: 'Create' });
    if (!name) return;
    run('mkdir', async () => { await post(`${base}/mkdir`, { path, name }); await load(); });
  };

  const touch = async () => {
    const name = await confirm({ title: 'New file', input: true, placeholder: 'File name (e.g. notes.txt)', confirmLabel: 'Create' });
    if (!name) return;
    run('touch', async () => {
      await post(`${base}/touch`, { path, name });
      await load();
      setEditor({ path: join(name), name, content: '', original: '', encoding: 'utf8' });
    });
  };

  const compress = async () => {
    const names = [...selected].map((p) => p.split('/').pop());
    const archive = await confirm({ title: `Compress ${names.length} item(s)`, message: 'Use .zip or .tar.gz as extension.', input: true, defaultValue: `archive-${new Date().toISOString().slice(0, 10)}.zip`, confirmLabel: 'Compress' });
    if (!archive) return;
    run('compress', async () => { await post(`${base}/compress`, { path, names, archive }); await load(); }, 'Archive created');
  };

  const doUpload = async (files) => {
    if (!files.length) return;
    setUploading({ count: files.length, progress: 0 });
    try {
      await upload(`${base}/upload?${q({ path })}`, files, (p) => setUploading((u) => u && { ...u, progress: p * 100 }));
      toast.success(`${files.length} file(s) uploaded`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(null);
    }
  };

  // Drag & drop (files and folders)
  const onDrop = async (ev) => {
    ev.preventDefault();
    setDragOver(false);
    const items = [...(ev.dataTransfer.items || [])];
    const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return doUpload([...ev.dataTransfer.files]);
    const out = [];
    const walk = (entry, prefix) => new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f) => { f.relativePath = prefix + f.name; out.push(f); resolve(); }, resolve);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const all = [];
        const readBatch = () => reader.readEntries(async (batch) => {
          if (!batch.length) { for (const e of all) await walk(e, `${prefix}${entry.name}/`); resolve(); return; }
          all.push(...batch);
          readBatch();
        }, resolve);
        readBatch();
      } else resolve();
    });
    for (const e of entries) await walk(e, '');
    doUpload(out);
  };

  const toggle = (p) => setSelected((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const allSelected = data?.entries.length > 0 && selected.size === data.entries.length;
  const dirty = editor && editor.content !== editor.original;

  return (
    <div className="space-y-3">
      {warning}
      <Card className="overflow-visible">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-3 py-2.5">
          <nav className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
            <button type="button" onClick={() => setPath('')} className="flex items-center gap-1 rounded px-1.5 py-1 text-ink-300 hover:bg-ink-700 hover:text-ink-100"><Home className="size-3.5" />root</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-0.5">
                <ChevronRight className="size-3.5 text-ink-500" />
                <button type="button" onClick={() => setPath(crumbs.slice(0, i + 1).join('/'))} className={cx('rounded px-1.5 py-1 hover:bg-ink-700', i === crumbs.length - 1 ? 'text-ink-100' : 'text-ink-300')}>{c}</button>
              </span>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-1.5">
            {selected.size > 0 && (
              <>
                <span className="mr-1 text-xs text-ink-300">{selected.size} selected</span>
                <Button size="sm" icon={Archive} onClick={compress} loading={busy === 'compress'}>Compress</Button>
                <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => removePaths([...selected])}>Delete</Button>
              </>
            )}
            <Button size="sm" variant="ghost" icon={FolderPlus} onClick={mkdir}>Folder</Button>
            <Button size="sm" variant="ghost" icon={FilePlus} onClick={touch}>File</Button>
            <Button size="sm" variant="ghost" icon={FolderUp} onClick={() => folderInput.current?.click()}>Upload folder</Button>
            <Button size="sm" variant="secondary" icon={Upload} onClick={() => fileInput.current?.click()}>Upload</Button>
            <Button size="icon" variant="ghost" aria-label="Refresh" title="Refresh" onClick={() => load()}><RefreshCw className="size-4" /></Button>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { doUpload([...e.target.files]); e.target.value = ''; }} />
            <input ref={folderInput} type="file" multiple hidden webkitdirectory="" directory="" onChange={(e) => { doUpload([...e.target.files]); e.target.value = ''; }} />
          </div>
        </div>

        {uploading && (
          <div className="border-b border-ink-700 px-4 py-3">
            <div className="mb-1.5 flex justify-between text-xs text-ink-200"><span>Uploading {uploading.count} file(s)...</span><span className="num">{uploading.progress.toFixed(0)}%</span></div>
            <ProgressBar value={uploading.progress} />
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cx('relative min-h-48', dragOver && 'bg-brand-500/5 outline-2 -outline-offset-4 outline-dashed outline-brand-500/60')}
        >
          {error ? <div className="p-4"><Alert type="error">{error}</Alert></div> : !data ? <Loading /> : data.entries.length === 0 ? (
            <div className="px-4 py-14 text-center text-sm text-ink-400">This folder is empty. Drop files here to upload them.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-400">
                  <tr className="border-b border-ink-700">
                    <th className="w-10 px-3 py-2"><input type="checkbox" aria-label="Select all" className="size-4 accent-brand-500" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(data.entries.map((e) => e.path)))} /></th>
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="hidden w-28 px-2 py-2 text-right font-medium sm:table-cell">Size</th>
                    <th className="hidden w-48 px-2 py-2 font-medium md:table-cell">Modified</th>
                    <th className="w-12 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {path && (
                    <tr className="cursor-pointer hover:bg-ink-800/60" onClick={() => setPath(crumbs.slice(0, -1).join('/'))}>
                      <td />
                      <td className="px-2 py-2 text-ink-300" colSpan={4}><span className="flex items-center gap-2.5"><Folder className="size-4 text-ink-400" />..</span></td>
                    </tr>
                  )}
                  {data.entries.map((e) => (
                    <tr key={e.path} className={cx('group hover:bg-ink-800/60', selected.has(e.path) && 'bg-brand-500/5')}>
                      <td className="px-3 py-1.5"><input type="checkbox" aria-label={`Select ${e.name}`} className="size-4 accent-brand-500" checked={selected.has(e.path)} onChange={() => toggle(e.path)} /></td>
                      <td className="px-2 py-1.5">
                        <button type="button" onClick={() => openEntry(e)} className="flex min-w-0 items-center gap-2.5 text-left hover:text-brand-300">
                          {iconFor(e)}<span className="truncate">{e.name}</span>{e.symlink && <span className="text-[10px] text-ink-400">link</span>}
                        </button>
                      </td>
                      <td className="num hidden px-2 py-1.5 text-right text-ink-300 sm:table-cell">{e.type === 'dir' ? '' : bytes(e.size)}</td>
                      <td className="hidden px-2 py-1.5 text-ink-400 md:table-cell">{dateTime(e.modified)}</td>
                      <td className="px-2 py-1">
                        <RowMenu entry={e} actions={{ edit, download, rename, extract, remove: (x) => removePaths([x.path]) }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={!!editor}
        size="xl"
        title={<span className="font-mono text-sm">{editor?.path}{dirty ? ' •' : ''}</span>}
        onClose={async () => {
          if (dirty && !(await confirm({ title: 'Discard changes?', message: 'You have unsaved changes.', danger: true, confirmLabel: 'Discard' }))) return;
          setEditor(null);
        }}
        footer={<>
          <span className="mr-auto self-center text-xs text-ink-400">Ctrl/Cmd + S to save</span>
          <Button variant="ghost" onClick={() => setEditor(null)}>Close</Button>
          <Button variant="primary" icon={Save} disabled={!dirty} loading={busy === 'save'} onClick={saveEditor}>Save</Button>
        </>}
      >
        {editor && <CodeEditor value={editor.content} filename={editor.name} onChange={(v) => setEditor((ed) => ({ ...ed, content: v }))} onSave={saveEditor} height="65vh" />}
      </Modal>
    </div>
  );
}
