import { useAppStore } from './store/index.ts';

export function App() {
  const initialized = useAppStore((s) => s.initialized);

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Mozetobedzieto</h1>
      <p>Analityczna maszyna AI dla twórców YouTube</p>
      <p>Status: {initialized ? 'Gotowe' : 'Inicjalizacja...'}</p>
    </main>
  );
}
