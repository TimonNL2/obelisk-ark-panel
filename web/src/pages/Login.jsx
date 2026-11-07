import { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn } from 'lucide-react';
import { post } from '../lib/api.js';
import { Alert, Button, Field, Input, easeOut } from '../components/ui.jsx';
import Obelisk from '../components/Obelisk.jsx';

const LIT = { key: 'online', color: 'var(--color-brand-400)', live: false };

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
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Obelisk info={LIT} height={150} width={40} delay={0.1} />
          <motion.h1 className="mt-5 text-[34px] font-semibold leading-none" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5, ease: easeOut }}>
            Obelisk
          </motion.h1>
          <motion.p className="mt-2 text-sm text-ink-300" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.5 }}>
            Sign in to manage your ARK servers
          </motion.p>
        </div>
        <motion.form onSubmit={submit} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5, ease: easeOut }}
          className="surface space-y-4 rounded-2xl border border-ink-700 p-6">
          {error && <Alert type="error">{error}</Alert>}
          <Field label="Username" htmlFor="u">
            <Input id="u" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </Field>
          <Field label="Password" htmlFor="p">
            <Input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy} icon={LogIn}>Sign in</Button>
        </motion.form>
        <p className="mt-6 text-center text-xs leading-relaxed text-ink-400">
          Forgot your password? Run <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-ink-200">sudo arkpanel reset-password &lt;user&gt;</code> on the server.
        </p>
      </div>
    </div>
  );
}
