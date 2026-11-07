import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { get, post } from './lib/api.js';
import { Loading } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Servers from './pages/Servers.jsx';
import ServerDetail from './pages/ServerDetail.jsx';
import Clusters from './pages/Clusters.jsx';
import ClusterDetail from './pages/ClusterDetail.jsx';
import Settings from './pages/Settings.jsx';

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
      </Layout>
    </AppCtx.Provider>
  );
}
