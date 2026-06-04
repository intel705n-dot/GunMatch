import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';

const HostLogin = lazy(() => import('./pages/host/HostLogin'));
const HostList = lazy(() => import('./pages/host/HostList'));
const HostProfile = lazy(() => import('./pages/host/HostProfile'));
const HostHelp = lazy(() => import('./pages/host/HostHelp'));
const HostCreate = lazy(() => import('./pages/host/HostCreate'));
const HostManage = lazy(() => import('./pages/host/HostManage'));
const PlayerEntry = lazy(() => import('./pages/player/PlayerEntry'));
const PlayerMain = lazy(() => import('./pages/player/PlayerMain'));

function RouteFallback() {
  return <Layout><p className="text-center py-16 text-stone-400">読み込み中...</p></Layout>;
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/host/login" element={<HostLogin />} />
        <Route path="/host" element={<HostList />} />
        <Route path="/host/profile" element={<HostProfile />} />
        <Route path="/host/help" element={<HostHelp />} />
        <Route path="/host/create" element={<HostCreate />} />
        <Route path="/host/:tournamentId" element={<HostManage />} />
        <Route path="/entry/:tournamentId" element={<PlayerEntry />} />
        <Route path="/play/:tournamentId" element={<PlayerMain />} />
        <Route path="/" element={<HostLogin />} />
      </Routes>
    </Suspense>
  );
}
