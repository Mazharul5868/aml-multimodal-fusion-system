import { useEffect, useState } from 'react';
import AppRouter from "./router/AppRouter";

export default function App() {
  const [waking, setWaking] = useState(true);
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  useEffect(() => {
    const wake = async () => {
      try {
        await fetch(`${BASE_URL}/api/v1/system/health`);
      } catch {
        // backend unreachable
      } finally {
        setWaking(false);
      }
    };
    wake();
  }, []);

  if (waking) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: '16px',
        fontFamily: 'sans-serif',
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '3px solid #e2e8f0',
          borderTopColor: '#2563eb',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: '1rem', color: '#374151', margin: 0 }}>
          Starting up the server…
        </p>
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
          Free tier servers sleep after inactivity — this may take up to 60 seconds
        </p>
      </div>
    );
  }

  return <AppRouter />;
}