import { Suspense, lazy } from 'react';

// CodeMirror is the largest part of the web interface: only load it when an editor opens.
const CodeEditor = lazy(() => import('./CodeEditor.jsx'));

export default function LazyCodeEditor(props) {
  return (
    <Suspense fallback={<div className="skeleton rounded-lg" style={{ height: props.height || '60vh' }} />}>
      <CodeEditor {...props} />
    </Suspense>
  );
}
