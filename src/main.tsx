import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './lib/AuthContext';
import HostLogin from './pages/host/HostLogin';
import HostList from './pages/host/HostList';
import HostProfile from './pages/host/HostProfile';
import HostHelp from './pages/host/HostHelp';
import HostCreate from './pages/host/HostCreate';
import HostManage from './pages/host/HostManage';
import PlayerEntry from './pages/player/PlayerEntry';
import PlayerMain from './pages/player/PlayerMain';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
