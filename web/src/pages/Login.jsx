import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { post } from '../lib/api.js';
import { Alert, Button, Field, Input } from '../components/ui.jsx';
import Logo from '../components/Logo.jsx';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/auth/login', { username, password });
      await onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.10),_transparent_60%)] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-12" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Obelisk</h1>
          <p className="mt-1 text-sm text-ink-300">Sign in to manage your servers</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-ink-700 bg-ink-850 p-6 shadow-2xl shadow-black/30">
          {error && <Alert type="error">{error}</Alert>}
          <Field label="Username" htmlFor="u">
            <Input id="u" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </Field>
          <Field label="Password" htmlFor="p">
            <Input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy} icon={LogIn}>Sign in</Button>
        </form>
        <p className="mt-6 text-center text-xs text-ink-400">
          Forgot your password? Run <code className="rounded bg-ink-800 px-1 py-0.5 font-mono text-ink-200">sudo arkpanel reset-password &lt;user&gt;</code> on the server.
        </p>
      </div>
    </div>
  );
}
