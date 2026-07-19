import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import LoginPage from './pages/LoginPage';
import { Navbar } from './components/ui/Navbar';
import { useAuthStore } from './stores/authStore';

// Kein Lade-/Flacker-Zustand nötig: main.tsx awaited fetchMe() vor dem Render,
// user ist beim ersten Render also bereits aufgelöst.
function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/"      element={<RequireAuth><HomePage /></RequireAuth>} />
        <Route path="/lobby" element={<RequireAuth><LobbyPage /></RequireAuth>} />
        <Route path="/game"  element={<RequireAuth><GamePage /></RequireAuth>} />
        <Route path="*"      element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
