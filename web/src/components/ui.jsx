import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, animate } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';

export const cx = (...c) => c.filter(Boolean).join(' ');

/** Shared motion presets: quick, slightly springy, never bouncy. */
export const spring = { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 };
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 };
export const easeOut = [0.16, 1, 0.3, 1];

/* ------------------------------ Button ------------------------------ */

const VARIANTS = {
  primary: 'bg-brand-400 text-ink-950 hover:bg-brand-300 font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]',
  secondary: 'bg-ink-700/80 text-ink-100 hover:bg-ink-600 border border-ink-600/80',
  ghost: 'text-ink-200 hover:bg-ink-700/60 hover:text-ink-100',
  danger: 'bg-[#e05a4e] text-white hover:bg-[#f06a5d] font-semibold',
  'danger-ghost': 'text-red-300 hover:bg-red-500/12',
  success: 'bg-beam-online text-ink-950 hover:brightness-110 font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]',
  warning: 'bg-ember-500 text-ink-950 hover:bg-ember-400 font-semibold',
};
const SIZES = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-[10px]',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
  icon: 'h-8 w-8 justify-center rounded-lg',
};

export function Button({ variant = 'secondary', size = 'md', loading, icon: Icon, children, className, disabled, type = 'button', ...rest }) {
  const off = disabled || loading;
  return (
    <motion.button
      type={type}
      whileTap={off ? undefined : { scale: 0.96 }}
      transition={spring}
      className={cx(
        'relative inline-flex items-center whitespace-nowrap select-none transition-[background-color,color,filter,border-color] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant], SIZES[size], className,
      )}
      disabled={off}
      {...rest}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {loading ? (
          <motion.span key="l" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} className="inline-flex">
            <Loader2 className="size-4 animate-spin" />
          </motion.span>
        ) : Icon ? (
          <motion.span key="i" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} className="inline-flex">
            <Icon className="size-4 shrink-0" />
          </motion.span>
        ) : null}
      </AnimatePresence>
      {children}
    </motion.button>
  );
}

/* ------------------------------ Surfaces ------------------------------ */

export function Card({ className, children, ...rest }) {
  return <div className={cx('surface rounded-[14px] border border-ink-700/80', className)} {...rest}>{children}</div>;
}

export function CardHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700/70 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon className="size-4 shrink-0 text-ink-400" />}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight text-ink-100">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-300">{subtitle}</div>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ color = 'gray', children, className }) {
  const colors = {
    gray: 'bg-ink-700/80 text-ink-200',
    green: 'bg-beam-online/12 text-beam-online',
    yellow: 'bg-ember-500/14 text-ember-400',
    red: 'bg-red-500/14 text-red-300',
    blue: 'bg-sky-400/12 text-sky-300',
    teal: 'bg-brand-400/12 text-brand-300',
    purple: 'bg-violet-400/14 text-violet-300',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', colors[color], className)}>{children}</span>;
}

export function GameBadge({ game }) {
  return game === 'asa'
    ? <Badge color="teal" className="font-display tracking-wide">ASA</Badge>
    : <Badge color="purple" className="font-display tracking-wide">ASE</Badge>;
}

/* ------------------------------ Server state ------------------------------ */

const STATE = {
  running: { key: 'online', label: 'Online', color: 'var(--color-beam-online)', text: 'text-beam-online', live: false },
  starting: { key: 'starting', label: 'Starting', color: 'var(--color-beam-starting)', text: 'text-ember-400', live: true },
  stopping: { key: 'stopping', label: 'Stopping', color: 'var(--color-beam-starting)', text: 'text-ember-400', live: true },
  stopped: { key: 'off', label: 'Offline', color: 'var(--color-beam-off)', text: 'text-ink-300', live: false },
  crashed: { key: 'crashed', label: 'Crashed', color: 'var(--color-beam-crashed)', text: 'text-red-300', live: false },
};

export function stateInfo(server) {
  const job = server?.runtime?.job;
  if (job) {
    const label = { install: 'Installing', update: 'Updating', validate: 'Validating', delete: 'Deleting' }[job.type] || 'Busy';
    return { key: 'busy', label, color: 'var(--color-beam-busy)', text: 'text-sky-300', live: true };
  }
  if (server && !server.installed) return { key: 'none', label: 'Not installed', color: 'var(--color-ink-500)', text: 'text-ink-400', live: false };
  return STATE[server?.runtime?.state] || STATE.stopped;
}

export function StatusDot({ server, info, className }) {
  const s = info || stateInfo(server);
  return (
    <span className={cx('relative inline-flex size-2 shrink-0 rounded-full', s.live && 'dot-ping', className)}
      style={{ background: s.color, color: s.color, boxShadow: s.key === 'online' ? `0 0 10px ${s.color}` : undefined }} />
  );
}

export function StatusBadge({ server, className }) {
  const s = stateInfo(server);
  return (
    <span className={cx('inline-flex items-center gap-2 text-xs font-semibold', s.text, className)}>
      <StatusDot info={s} />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={s.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          {s.label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------ Feedback ------------------------------ */

export function Spinner({ className }) {
  return <Loader2 className={cx('size-5 animate-spin text-ink-300', className)} />;
}

export function Loading({ rows = 3 }) {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-14 rounded-xl" style={{ opacity: 1 - i * 0.22 }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && <div className="mb-4 rounded-2xl border border-ink-700 bg-ink-900 p-3.5"><Icon className="size-6 text-ink-300" /></div>}
      <h3 className="text-base font-semibold text-ink-100">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-300">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ type = 'info', title, children, className, action }) {
  const map = {
    info: ['border-sky-400/25 bg-sky-400/[0.07] text-sky-100', Info, 'text-sky-300'],
    warning: ['border-ember-500/30 bg-ember-500/[0.08] text-ember-400', AlertTriangle, 'text-ember-400'],
    error: ['border-red-400/30 bg-red-500/[0.08] text-red-200', XCircle, 'text-red-300'],
    success: ['border-beam-online/30 bg-beam-online/[0.07] text-emerald-100', CheckCircle2, 'text-beam-online'],
  };
  const [cls, Icon, iconCls] = map[type];
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: easeOut }}
      className={cx('flex gap-3 rounded-xl border px-4 py-3 text-sm', cls, className)}>
      <Icon className={cx('mt-0.5 size-4 shrink-0', iconCls)} />
      <div className="min-w-0 flex-1 leading-relaxed">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </motion.div>
  );
}

export function ProgressBar({ value, className }) {
  const indeterminate = value === null || value === undefined;
  return (
    <div className={cx('relative h-1.5 w-full overflow-hidden rounded-full bg-ink-700', className)}>
      {indeterminate ? (
        <motion.div className="absolute inset-y-0 w-1/3 rounded-full bg-beam-busy"
          animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} />
      ) : (
        <motion.div className="h-full rounded-full bg-beam-busy" initial={false}
          animate={{ width: `${Math.max(2, Math.min(100, value))}%` }} transition={softSpring} />
      )}
    </div>
  );
}

export function Meter({ value }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const c = v > 90 ? 'var(--color-beam-crashed)' : v > 75 ? 'var(--color-ember-400)' : 'var(--color-brand-400)';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
      <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${v}%`, backgroundColor: c }} transition={softSpring} />
    </div>
  );
}

/** Animated circular gauge, value 0-100. */
export function Ring({ value, size = 56, stroke = 5, children }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = v > 90 ? 'var(--color-beam-crashed)' : v > 75 ? 'var(--color-ember-400)' : 'var(--color-brand-400)';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-ink-700)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (v / 100) * c, stroke: color }} transition={softSpring} />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

/** Number that springs to its new value. */
export function AnimatedNumber({ value, format = (v) => Math.round(v).toString(), className }) {
  const mv = useMotionValue(typeof value === 'number' ? value : 0);
  const spr = useSpring(mv, { stiffness: 140, damping: 24 });
  const text = useTransform(spr, (v) => format(v));
  useEffect(() => { if (typeof value === 'number') mv.set(value); }, [value, mv]);
  if (typeof value !== 'number') return <span className={className}>{value ?? '—'}</span>;
  return <motion.span className={cx('num', className)}>{text}</motion.span>;
}

/* ------------------------------ Forms ------------------------------ */

export function Field({ label, hint, error, children, className, htmlFor }) {
  return (
    <div className={className}>
      {label && <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-200">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{hint}</p>}
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

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      className={cx('relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full p-[3px] transition-colors duration-200', checked ? 'bg-brand-500' : 'bg-ink-600', disabled && 'opacity-50')}
    >
      <motion.span layout transition={spring} className={cx('size-4 rounded-full bg-white shadow-md', checked && 'ml-auto')} />
    </button>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  if (!label && !description) return <Switch checked={checked} onChange={onChange} disabled={disabled} label="Toggle" />;
  return (
    <label className={cx('flex items-start justify-between gap-4 py-2.5', disabled ? 'opacity-60' : 'cursor-pointer')}>
      <span className="min-w-0">
        <span className="block text-sm text-ink-100">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-ink-400">{description}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </label>
  );
}

export function Tabs({ tabs, active, onChange }) {
  const id = useId();
  return (
    <div className="-mx-1 flex gap-0.5 overflow-x-auto border-b border-ink-700/80 px-1 [scrollbar-width:none]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx('relative flex items-center gap-2 whitespace-nowrap px-3 pb-3 pt-2 text-sm font-medium transition-colors', active === t.id ? 'text-ink-100' : 'text-ink-400 hover:text-ink-200')}
        >
          {t.icon && <t.icon className={cx('size-4 transition-colors', active === t.id && 'text-brand-400')} />}
          {t.label}
          {t.count ? <span className="num rounded-full bg-brand-400/15 px-1.5 text-[10px] font-semibold text-brand-300">{t.count}</span> : null}
          {active === t.id && <motion.span layoutId={`tab-${id}`} transition={spring} className="absolute inset-x-1.5 -bottom-px h-[2px] rounded-full bg-brand-400 shadow-[0_0_12px_var(--color-brand-400)]" />}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Menus ------------------------------ */

export function Menu({ trigger, items, align = 'right', width = 'w-56' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.94, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
            transition={spring}
            style={{ transformOrigin: align === 'right' ? 'top right' : 'top left' }}
            className={cx('absolute z-30 mt-1.5 overflow-hidden rounded-xl border border-ink-600 bg-ink-800/95 p-1 shadow-2xl shadow-black/50 backdrop-blur-md', align === 'right' ? 'right-0' : 'left-0', width)}
          >
            {items.filter(Boolean).map((it) => (
              <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}
                className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors', it.danger ? 'text-red-300 hover:bg-red-500/12' : 'text-ink-100 hover:bg-ink-700')}>
                {it.icon && <it.icon className="size-4 shrink-0 opacity-80" />}{it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
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
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-6xl', full: 'max-w-[96vw]' };
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 pt-[7vh] backdrop-blur-[3px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.2 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            role="dialog" aria-modal="true"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.14 } }}
            transition={spring}
            className={cx('surface w-full rounded-2xl border border-ink-600/80 shadow-2xl shadow-black/60', widths[size], className)}
          >
            <div className="flex items-center justify-between gap-4 border-b border-ink-700/80 px-5 py-4">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-100" aria-label="Close"><X className="size-4" /></button>
            </div>
            <div className="px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-700/80 px-5 py-3.5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ------------------------------ Toasts ------------------------------ */

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 3600);
  }, []);
  const api = useRef(null);
  api.current ||= { success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) };
  const icon = { error: [XCircle, 'text-red-300'], success: [CheckCircle2, 'text-beam-online'], info: [Info, 'text-sky-300'] };
  return (
    <ToastCtx.Provider value={api.current}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[min(380px,calc(100vw-2.5rem))] flex-col items-end gap-2" aria-live="polite">
          <AnimatePresence initial={false}>
            {toasts.map((t) => {
              const [Icon, cls] = icon[t.type];
              return (
                <motion.div key={t.id} layout
                  initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40, scale: 0.96, transition: { duration: 0.18 } }}
                  transition={spring}
                  onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
                  className="pointer-events-auto flex w-full cursor-pointer items-start gap-2.5 rounded-xl border border-ink-600 bg-ink-800/95 px-3.5 py-3 text-sm text-ink-100 shadow-2xl shadow-black/50 backdrop-blur-md">
                  <Icon className={cx('mt-0.5 size-4 shrink-0', cls)} />
                  <span className="min-w-0 break-words leading-relaxed">{t.message}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
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
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [checked, setChecked] = useState(false);
  const confirm = useCallback((opts) => new Promise((resolve) => {
    setText(opts.defaultValue || '');
    setChecked(false);
    setState({ ...opts, resolve });
    setOpen(true);
  }), []);
  const close = (value) => { state?.resolve(value); setOpen(false); };
  const typedOk = !state?.typeToConfirm || text === state.typeToConfirm;
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={open}
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
        {state?.message && <div className="text-sm leading-relaxed text-ink-200">{state.message}</div>}
        {state?.input && (
          <Input className="mt-3" autoFocus value={text} placeholder={state.placeholder} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && text.trim() && close(text)} />
        )}
        {state?.typeToConfirm && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-ink-300">Type <span className="font-semibold text-ink-100">{state.typeToConfirm}</span> to confirm</p>
            <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        {state?.checkbox && (
          <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-ink-200">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="size-4 accent-[var(--color-brand-400)]" />
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

/* ------------------------------ Misc ------------------------------ */

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
    <button type="button" onClick={copy} className={cx('relative rounded-md px-1.5 py-0.5 text-xs text-ink-300 transition-colors hover:bg-ink-700 hover:text-ink-100', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={done ? 'd' : 'c'} className="inline-block" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
          {done ? 'Copied' : 'Copy'}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function Sparkline({ points, max, color = 'var(--color-brand-400)', height = 36 }) {
  const id = useId();
  if (!points?.length) return <div style={{ height }} />;
  const w = 200;
  const m = max ?? Math.max(1, ...points);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(height - (p / m) * (height - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={`${d} L${w},${height} L0,${height} Z`} fill={`url(#g${id})`} initial={false} animate={{ d: `${d} L${w},${height} L0,${height} Z` }} transition={{ duration: 0.5, ease: easeOut }} />
      <motion.path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1, d }} transition={{ duration: 0.8, ease: easeOut }} />
    </svg>
  );
}

/** Save bar that slides up from the bottom while a form has unsaved changes. */
export function SaveBar({ show, count, onSave, onDiscard, saving, label = 'Save changes' }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={spring}
          className="sticky bottom-5 z-20 mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-ink-600 bg-ink-800/95 py-2.5 pl-4 pr-2.5 shadow-2xl shadow-black/60 backdrop-blur-md"
        >
          <span className="size-2 shrink-0 rounded-full bg-ember-400 shadow-[0_0_10px_var(--color-ember-400)]" />
          <span className="flex-1 text-sm text-ink-200">{count ? `${count} unsaved change${count === 1 ? '' : 's'}` : 'Unsaved changes'}</span>
          {onDiscard && <Button variant="ghost" size="sm" onClick={onDiscard}>Discard</Button>}
          <Button variant="primary" size="sm" loading={saving} onClick={onSave}>{label}</Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { animate };
