import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';

export const cx = (...c) => c.filter(Boolean).join(' ');

/* ------------------------------ Button ------------------------------ */

const VARIANTS = {
  primary: 'bg-brand-500 text-ink-950 hover:bg-brand-400 font-semibold',
  secondary: 'bg-ink-700 text-ink-100 hover:bg-ink-600 border border-ink-600',
  ghost: 'text-ink-200 hover:bg-ink-700/70 hover:text-ink-100',
  danger: 'bg-red-500/90 text-white hover:bg-red-500 font-semibold',
  'danger-ghost': 'text-red-300 hover:bg-red-500/15',
  success: 'bg-emerald-500 text-ink-950 hover:bg-emerald-400 font-semibold',
  warning: 'bg-ember-500 text-ink-950 hover:bg-ember-400 font-semibold',
};
const SIZES = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
  icon: 'h-8 w-8 justify-center',
};

export function Button({ variant = 'secondary', size = 'md', loading, icon: Icon, children, className, disabled, ...rest }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center rounded-lg transition-colors whitespace-nowrap select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        VARIANTS[variant], SIZES[size], className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
}

/* ------------------------------ Layout bits ------------------------------ */

export function Card({ className, children, ...rest }) {
  return <div className={cx('rounded-xl border border-ink-700 bg-ink-850', className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-5 py-3.5">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && <Icon className="size-4 text-ink-300 shrink-0" />}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
          {subtitle && <p className="text-xs text-ink-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-100">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-300">{subtitle}</div>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ color = 'gray', children, className }) {
  const colors = {
    gray: 'bg-ink-700 text-ink-200',
    green: 'bg-emerald-500/15 text-emerald-300',
    yellow: 'bg-ember-500/15 text-ember-400',
    red: 'bg-red-500/15 text-red-300',
    blue: 'bg-sky-500/15 text-sky-300',
    teal: 'bg-brand-500/15 text-brand-300',
    purple: 'bg-violet-500/15 text-violet-300',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', colors[color], className)}>{children}</span>;
}

export function GameBadge({ game }) {
  return game === 'asa' ? <Badge color="teal">ASA</Badge> : <Badge color="purple">ASE</Badge>;
}

const STATE = {
  running: { label: 'Online', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  starting: { label: 'Starting', dot: 'bg-ember-400 pulse-dot', text: 'text-ember-400' },
  stopping: { label: 'Stopping', dot: 'bg-ember-400 pulse-dot', text: 'text-ember-400' },
  stopped: { label: 'Offline', dot: 'bg-ink-400', text: 'text-ink-300' },
  crashed: { label: 'Crashed', dot: 'bg-red-400', text: 'text-red-300' },
};

export function stateInfo(server) {
  const job = server?.runtime?.job;
  if (job) {
    const label = { install: 'Installing', update: 'Updating', validate: 'Validating', delete: 'Deleting' }[job.type] || 'Busy';
    return { label, dot: 'bg-sky-400 pulse-dot', text: 'text-sky-300' };
  }
  if (server && !server.installed) return { label: 'Not installed', dot: 'bg-ink-500', text: 'text-ink-400' };
  return STATE[server?.runtime?.state] || STATE.stopped;
}

export function StatusBadge({ server, className }) {
  const s = stateInfo(server);
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-medium', s.text, className)}>
      <span className={cx('size-2 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cx('size-5 animate-spin text-ink-300', className)} />;
}

export function Loading({ label = 'Loading...' }) {
  return <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-300"><Spinner />{label}</div>;
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && <div className="mb-4 rounded-xl bg-ink-800 p-3"><Icon className="size-6 text-ink-300" /></div>}
      <h3 className="text-base font-semibold text-ink-100">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm text-ink-300">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ type = 'info', title, children, className, action }) {
  const map = {
    info: ['border-sky-500/30 bg-sky-500/10 text-sky-200', Info],
    warning: ['border-ember-500/30 bg-ember-500/10 text-ember-400', AlertTriangle],
    error: ['border-red-500/30 bg-red-500/10 text-red-200', XCircle],
    success: ['border-emerald-500/30 bg-emerald-500/10 text-emerald-200', CheckCircle2],
  };
  const [cls, Icon] = map[type];
  return (
    <div className={cx('flex gap-3 rounded-lg border px-4 py-3 text-sm', cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({ value, className }) {
  const indeterminate = value === null || value === undefined;
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-ink-700', className)}>
      <div
        className={cx('h-full rounded-full bg-brand-400 transition-[width] duration-500', indeterminate && 'w-1/3 animate-pulse')}
        style={indeterminate ? undefined : { width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Meter({ value, color = 'bg-brand-400' }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const c = v > 90 ? 'bg-red-400' : v > 75 ? 'bg-ember-400' : color;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
      <div className={cx('h-full rounded-full transition-[width] duration-700', c)} style={{ width: `${v}%` }} />
    </div>
  );
}

/* ------------------------------ Forms ------------------------------ */

export function Field({ label, hint, error, children, className, htmlFor }) {
  return (
    <div className={className}>
      {label && <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink-200">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>}
      {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
    </div>
  );
}

export function Input({ className, ...rest }) {
  return <input className={cx('input', className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return <select className={cx('input', className)} {...rest}>{children}</select>;
}

export function Textarea({ className, ...rest }) {
  return <textarea className={cx('input min-h-20', className)} {...rest} />;
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={cx('flex items-start justify-between gap-4 py-2', disabled ? 'opacity-60' : 'cursor-pointer')}>
      <span className="min-w-0">
        <span className="block text-sm text-ink-100">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-400">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60', checked ? 'bg-brand-500' : 'bg-ink-600')}
      >
        <span className={cx('inline-block size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-ink-700 px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx(
            'relative flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm transition-colors',
            active === t.id ? 'text-ink-100' : 'text-ink-300 hover:text-ink-100',
          )}
        >
          {t.icon && <t.icon className="size-4" />}
          {t.label}
          {active === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-400" />}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Modal ------------------------------ */

export function Modal({ open, onClose, title, children, footer, size = 'md', className }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-6xl', full: 'max-w-[96vw]' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" className={cx('w-full rounded-xl border border-ink-600 bg-ink-850 shadow-2xl shadow-black/50', widths[size], className)}>
        <div className="flex items-center justify-between gap-4 border-b border-ink-700 px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-300 hover:bg-ink-700 hover:text-ink-100" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-700 px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------ Toasts ------------------------------ */

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-4), { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 3500);
  }, []);
  const api = useRef(null);
  api.current ||= { success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) };
  return (
    <ToastCtx.Provider value={api.current}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} className={cx(
              'pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm shadow-xl shadow-black/40 backdrop-blur',
              t.type === 'error' ? 'border-red-500/40 bg-ink-850/95 text-red-200' : t.type === 'success' ? 'border-emerald-500/40 bg-ink-850/95 text-emerald-200' : 'border-ink-600 bg-ink-850/95 text-ink-100',
            )}>
              {t.type === 'error' ? <XCircle className="mt-0.5 size-4 shrink-0" /> : t.type === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
              <span className="min-w-0 break-words">{t.message}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ------------------------------ Confirm dialog ------------------------------ */

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [text, setText] = useState('');
  const [checked, setChecked] = useState(false);
  const confirm = useCallback((opts) => new Promise((resolve) => {
    setText(opts.defaultValue || '');
    setChecked(false);
    setState({ ...opts, resolve });
  }), []);
  const close = (value) => { state?.resolve(value); setState(null); };
  const typedOk = !state?.typeToConfirm || text === state.typeToConfirm;
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title || 'Are you sure?'}
        size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
          <Button
            variant={state?.danger ? 'danger' : 'primary'}
            disabled={!typedOk || (state?.input && !text.trim())}
            onClick={() => close(state?.input ? text : state?.checkbox ? { checked } : true)}
          >{state?.confirmLabel || 'Confirm'}</Button>
        </>}
      >
        {state?.message && <div className="text-sm text-ink-200">{state.message}</div>}
        {state?.input && (
          <Input className="mt-3" autoFocus value={text} placeholder={state.placeholder} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && text.trim() && close(text)} />
        )}
        {state?.typeToConfirm && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-ink-300">Type <span className="font-mono text-ink-100">{state.typeToConfirm}</span> to confirm</p>
            <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        {state?.checkbox && (
          <label className="mt-3 flex items-center gap-2 text-sm text-ink-200">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="size-4 accent-brand-500" />
            {state.checkbox}
          </label>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

/** Run an async action with a loading flag and error toast. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const run = useCallback(async (key, fn, successMsg) => {
    setBusy(key);
    try {
      const r = await fn();
      if (successMsg) toast.success(successMsg);
      return r;
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [toast]);
  return [busy, run];
}

export function CopyButton({ value, className }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button type="button" onClick={copy} className={cx('rounded px-1.5 py-0.5 text-xs text-ink-300 hover:bg-ink-700 hover:text-ink-100', className)}>
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

export function Sparkline({ points, max, color = '#2dd4bf', height = 36 }) {
  if (!points?.length) return <div style={{ height }} />;
  const w = 200;
  const m = max ?? Math.max(1, ...points);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(height - (p / m) * (height - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <path d={`${d} L${w},${height} L0,${height} Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
