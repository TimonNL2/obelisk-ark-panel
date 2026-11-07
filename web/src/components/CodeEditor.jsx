import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import { StreamLanguage } from '@codemirror/language';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { json } from '@codemirror/lang-json';
import { EditorView, keymap } from '@codemirror/view';

function languageFor(filename = '') {
  const ext = filename.toLowerCase().split('.').pop();
  if (['ini', 'cfg', 'conf', 'properties', 'txt', 'log'].includes(ext)) return [StreamLanguage.define(properties)];
  if (ext === 'json') return [json()];
  if (['sh', 'bash'].includes(ext)) return [StreamLanguage.define(shell)];
  return [];
}

export default function CodeEditor({ value, onChange, filename, onSave, readOnly = false, height = '60vh' }) {
  const extensions = useMemo(() => [
    ...languageFor(filename),
    EditorView.lineWrapping,
    keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { onSave?.(); return true; } }]),
  ], [filename, onSave]);
  return (
    <div className="overflow-hidden rounded-lg border border-ink-700" style={{ height }}>
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={tokyoNight}
        extensions={extensions}
        readOnly={readOnly}
        height="100%"
        basicSetup={{ foldGutter: false, highlightActiveLine: true }}
      />
    </div>
  );
}
