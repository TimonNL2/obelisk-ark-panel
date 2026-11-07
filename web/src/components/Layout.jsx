import { createContext, useContext, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { LayoutDashboard, Server, Network, Settings, LogOut, Menu as MenuIcon, X, Search } from 'lucide-react';
import { useApp } from '../App.jsx';
import { get } from '../lib/api.js';
import { usePoll } from '../lib/hooks.js';
import { StatusDot, cx, easeOut, spring } from './ui.jsx';
import Logo from './Logo.jsx';
import CommandPalette from './CommandPalette.jsx';
import CreateServerModal from './CreateServerModal.jsx';

const ServersCtx = createContext(null);
/** All servers + clusters, refreshed every 3 seconds and shared by every page. */
export const useServers = () => useContext(ServersCtx);

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/servers', label: 'Servers', icon: Server },
  { to: '/clusters', label: 'Clusters', icon: Network },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function NavItem({ to, end, onNavigate, children, layoutGroup }) {
  return (
    <NavLink to={to} end={end} onClick={onNavigate}
      className={({ isActive }) => cx('relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors', isActive ? 'text-ink-100' : 'text-ink-300 hover:text-ink-100')}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId={layoutGroup} transition={spring} className="absolute inset-0 rounded-[10px] border border-ink-600/70 bg-ink-700/70" />}
          <span className="relative flex min-w-0 flex-1 items-center gap-3">{children}</span>
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ servers, onNavigate, id }) {
  const { user, logout, panelName } = useApp();
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <Logo className="size-9" />
        <div className="min-w-0">
          <div className="truncate font-display text-[17px] font-semibold leading-tight">{panelName}</div>
          <div className="text-[11px] text-ink-400">ARK server panel</div>
        </div>
      </div>
      <div className="px-3 pb-3">
        <button type="button" onClick={() => window.dispatchEvent(new Event('obelisk:palette'))}
          className="flex w-full items-center gap-2.5 rounded-[10px] border border-ink-700 bg-ink-900/70 px-3 py-2 text-sm text-ink-400 transition-colors hover:border-ink-600 hover:text-ink-200">
          <Search className="size-4" />
          <span className="flex-1 text-left">Jump to...</span>
          <kbd className="rounded border border-ink-600 px-1.5 text-[10px]">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
      </div>
      <nav className="space-y-0.5 px-3">
        {NAV.map((n) => (
          <NavItem key={n.to} to={n.to} end={n.end} onNavigate={onNavigate} layoutGroup={`nav-${id}`}>
            <n.icon className="size-4 shrink-0" />{n.label}
          </NavItem>
        ))}
      </nav>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
        {servers?.length > 0 && (
          <>
            <div className="px-3 pb-2 text-xs font-medium text-ink-400">Your servers</div>
            <div className="space-y-0.5">
              {servers.map((s) => (
                <NavItem key={s.id} to={`/servers/${s.id}`} onNavigate={onNavigate} layoutGroup={`nav-${id}`}>
                  <StatusDot server={s} />
                  <span className="truncate">{s.name}</span>
                  {s.runtime.playerCount > 0 && <span className="num ml-auto text-[11px] text-ink-400">{s.runtime.playerCount}</span>}
                </NavItem>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="border-t border-ink-700/80 p-3">
        <div className="flex items-center gap-3 rounded-[10px] px-2 py-1.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-brand-400/15 font-display text-sm font-semibold uppercase text-brand-300">{user.username[0]}</div>
          <span className="min-w-0 flex-1 truncate text-sm text-ink-200">{user.username}</span>
          <button type="button" onClick={logout} title="Sign out" aria-label="Sign out" className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-700 hover:text-ink-100">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const location = useLocation();
  const servers = usePoll(() => get('/servers'), 3000);
  const clusters = usePoll(() => get('/clusters'), 10000);
  const ctx = {
    servers: servers.data,
    clusters: clusters.data,
    reload: () => { servers.reload(); clusters.reload(); },
  };
  const pageKey = location.pathname.split('/').slice(0, 3).join('/');

  return (
    <ServersCtx.Provider value={ctx}>
      <div className="flex h-full">
        <aside className="hidden w-[260px] shrink-0 border-r border-ink-700/80 bg-ink-900 lg:block">
          <Sidebar servers={servers.data} id="desk" />
        </aside>

        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
              <motion.aside className="absolute inset-y-0 left-0 w-[280px] border-r border-ink-700 bg-ink-900"
                initial={{ x: -290 }} animate={{ x: 0 }} exit={{ x: -290 }} transition={spring}>
                <button type="button" className="absolute right-3 top-5 z-10 rounded-lg p-1.5 text-ink-300 hover:bg-ink-700" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-4" /></button>
                <Sidebar servers={servers.data} onNavigate={() => setOpen(false)} id="mobile" />
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-ink-700/80 bg-ink-900 px-4 py-3 lg:hidden">
            <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-ink-200 hover:bg-ink-700" aria-label="Open menu"><MenuIcon className="size-5" /></button>
            <Logo className="size-7" />
            <span className="font-display text-base font-semibold">Obelisk</span>
            <button type="button" onClick={() => window.dispatchEvent(new Event('obelisk:palette'))} className="ml-auto rounded-lg p-1.5 text-ink-300 hover:bg-ink-700" aria-label="Search"><Search className="size-5" /></button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <motion.div
              key={pageKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: easeOut }}
              className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-9"
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>
      <CommandPalette servers={servers.data} clusters={clusters.data} onNewServer={() => setCreating(true)} />
      <CreateServerModal open={creating} onClose={() => setCreating(false)} />
    </ServersCtx.Provider>
  );
}
