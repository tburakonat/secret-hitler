import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import { Navbar } from './components/ui/Navbar';
import { useSessionStore } from './stores/sessionStore';

export default function App() {
  const lastError = useSessionStore((s) => s.lastError);

  return (
    <BrowserRouter>
      <Navbar />
      {lastError && (
        <div className="bg-red-900/60 px-4 py-2 text-center text-sm text-red-200">
          {lastError}
        </div>
      )}
      <Routes>
        <Route path="/"      element={<HomePage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/game"  element={<GamePage />} />
        <Route path="*"      element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
