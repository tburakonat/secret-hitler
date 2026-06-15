import { BrowserRouter, Route, Routes } from 'react-router-dom';

function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Secret Hitler</h1>
        <p className="mt-2 text-gray-400">Multiplayer coming soon.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
