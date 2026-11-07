import { createContext, useContext, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Server, Network, Settings, LogOut, Menu, X } from 'lucide-react';
import { useApp } from '../App.jsx';
import { get } from '../lib/api.js';
import { usePoll } from '../lib/hooks.js';
import { cx, stateInfo } from './ui.jsx';
import Logo from './Logo.jsx';

const ServersCtx = createContext(null);
/** All servers + clusters, refreshed every 3 seconds and shared by every page. */
export const useServers = () => useContext(ServersCtx);

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/servers', label: 'Servers', icon: Server },
  { to: '/clusters', label: 'Clusters', icon: Network },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Sidebar({ servers, onNavigate }) {
  const { user, logout, panelName } = useApp();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo className="size-8" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{panelName}</div>
          <div className="text-[11px] text-ink-400">ARK server management</div>
        </div>
      </div>
      <nav className="space-y-0.5 px-3">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={onNavigate}
            className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors', isActive ? 'bg-ink-700/80 text-ink-100' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100')}>
            <n.icon className="size-4" />
            {n.label}
          </NavLink>
        ))}
      </nav>

      {servers?.length > 0 && (
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Your servers</div>
          <div className="space-y-0.5">
            {servers.map((s) => {
              const st = stateInfo(s);
              return (
                <NavLink key={s.id} to={`/servers/${s.id}`} onClick={onNavigate}
                  className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors', isActive ? 'bg-ink-800 text-ink-100' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100')}>
                  <span className={cx('size-1.5 shrink-0 rounded-full', st.dot)} />
                  <span className="truncate">{s.name}</span>
                  {s.runtime.playerCount > 0 && <span className="num ml-auto text-[11px] text-ink-400">{s.runtime.playerCount}</span>}
                </NavLink>
              );
            })}
          </div>
        </div>
      )}
      {!servers?.length && <div className="flex-1" />}

      <div className="border-t border-ink-700 p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold uppercase text-brand-300">{user.username[0]}</div>
          <span className="min-w-0 flex-1 truncate text-sm text-ink-200">{user.username}</span>
          <button type="button" onClick={logout} title="Sign out" aria-label="Sign out" className="rounded-md p-1.5 text-ink-300 hover:bg-ink-700 hover:text-ink-100">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const servers = usePoll(() => get('/servers'), 3000);
  const clusters = usePoll(() => get('/clusters'), 5000);
  const ctx = {
    servers: servers.data,
    clusters: clusters.data,
    reload: () => { servers.reload(); clusters.reload(); },
  };

  return (
    <ServersCtx.Provider value={ctx}>
      <div className="flex h-full">
        <aside className="hidden w-64 shrink-0 border-r border-ink-700 bg-ink-900 lg:block">
          <Sidebar servers={servers.data} />
        </aside>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 border-r border-ink-700 bg-ink-900">
              <button type="button" className="absolute right-3 top-5 rounded-md p-1.5 text-ink-300 hover:bg-ink-700" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-4" /></button>
              <Sidebar servers={servers.data} onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-ink-700 bg-ink-900 px-4 py-3 lg:hidden">
            <button type="button" onClick={() => setOpen(true)} className="rounded-md p-1.5 text-ink-200 hover:bg-ink-700" aria-label="Open menu"><Menu className="size-5" /></button>
            <Logo className="size-6" />
            <span className="text-sm font-semibold">Obelisk</span>
          </header>
          <main key={location.pathname.split('/').slice(0, 3).join('/')} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
          </main>
        </div>
      </div>
    </ServersCtx.Provider>
  );
}
