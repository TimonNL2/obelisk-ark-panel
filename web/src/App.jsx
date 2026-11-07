import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { get, post } from './lib/api.js';
import { Loading } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

// Loaded on demand to keep the first page load small
const Servers = lazy(() => import('./pages/Servers.jsx'));
const ServerDetail = lazy(() => import('./pages/ServerDetail.jsx'));
const Clusters = lazy(() => import('./pages/Clusters.jsx'));
const ClusterDetail = lazy(() => import('./pages/ClusterDetail.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export default function App() {
  const [session, setSession] = useState(undefined);
  const [meta, setMeta] = useState(null);

  const loadSession = useCallback(async () => {
    try {
      const me = await get('/auth/me');
      setSession(me);
      setMeta(await get('/meta'));
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);
  useEffect(() => {
    const onUnauth = () => setSession(null);
    window.addEventListener('arkpanel:unauthorized', onUnauth);
    return () => window.removeEventListener('arkpanel:unauthorized', onUnauth);
  }, []);
  useEffect(() => {
    if (session?.panelName) document.title = session.panelName;
  }, [session]);

  const logout = async () => {
    try { await post('/auth/logout'); } catch { /* ignore */ }
    setSession(null);
  };

  if (session === undefined) return <div className="h-full"><Loading /></div>;
  if (!session) return <Login onLogin={loadSession} />;
  if (!meta) return <div className="h-full"><Loading /></div>;

  return (
    <AppCtx.Provider value={{ user: session.user, panelName: session.panelName, meta, logout, reloadSession: loadSession }}>
      <Layout>
        <Suspense fallback={<Loading rows={3} />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/servers" element={<Servers />} />
          <Route path="/servers/:id" element={<ServerDetail />} />
          <Route path="/servers/:id/:tab" element={<ServerDetail />} />
          <Route path="/clusters" element={<Clusters />} />
          <Route path="/clusters/:id" element={<ClusterDetail />} />
          <Route path="/clusters/:id/:tab" element={<ClusterDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/:tab" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </Layout>
    </AppCtx.Provider>
  );
}
