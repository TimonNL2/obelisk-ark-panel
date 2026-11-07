import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { get, put } from '../../lib/api.js';
import { Alert, Button, Loading, cx, useConfirm, useToast } from '../../components/ui.jsx';
import CodeEditor from '../../components/CodeEditor.jsx';

const FILES = ['GameUserSettings.ini', 'Game.ini'];
const MANAGED = 'SessionName, Port, QueryPort, RCONEnabled, RCONPort, ServerPassword, ServerAdminPassword, MaxPlayers, ActiveMods (ASE), Message of the day and everything set in the Game settings tab';

export default function ConfigFiles({ server }) {
  const [file, setFile] = useState(FILES[0]);
  const [doc, setDoc] = useState(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const running = ['running', 'starting'].includes(server.runtime.state);

  const load = useCallback(async (f) => {
    setDoc(null);
    const d = await get(`/servers/${server.id}/config/${f}`);
    setDoc(d);
    setContent(d.content);
  }, [server.id]);

  useEffect(() => { load(file).catch((e) => toast.error(e.message)); }, [file, load, toast]);

  const dirty = doc && content !== doc.content;

  const switchFile = async (f) => {
    if (f === file) return;
    if (dirty && !(await confirm({ title: 'Discard changes?', danger: true, confirmLabel: 'Discard' }))) return;
    setFile(f);
  };

  const save = useCallback(async () => {
    if (running && file === 'GameUserSettings.ini' && !(await confirm({
      title: 'Server is running',
      message: 'ARK rewrites GameUserSettings.ini when it shuts down, which can undo your edits. Stop the server first for reliable changes. Save anyway?',
      confirmLabel: 'Save anyway',
    }))) return;
    setSaving(true);
    try {
      await put(`/servers/${server.id}/config/${file}`, { content });
      setDoc((d) => ({ ...d, content, exists: true }));
      toast.success(`${file} saved`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }, [running, file, content, server.id, confirm, toast]);

  return (
    <div className="space-y-4">
      <Alert type="info" title="Panel-managed values">
        These are written by the panel on every start and override what you put here: {MANAGED}.
      </Alert>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
          {FILES.map((f) => (
            <button key={f} type="button" onClick={() => switchFile(f)} className={cx('rounded-md px-3 py-1.5 font-mono text-xs', f === file ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:text-ink-100')}>{f}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => load(file)}>Reload</Button>
          <Button size="sm" variant="primary" icon={Save} disabled={!dirty} loading={saving} onClick={save}>Save</Button>
        </div>
      </div>
      {!doc ? <Loading /> : (
        <>
          {!doc.exists && <Alert type="info">This file does not exist yet. It is created on the first start, or when you save it here.</Alert>}
          <CodeEditor value={content} onChange={setContent} filename={file} onSave={save} height="62vh" />
        </>
      )}
    </div>
  );
}
