import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { RealtimeProvider } from "@/components/RealtimeProvider"
import App from './App.tsx'

// When the page is restored from the browser's back/forward cache (bfcache),
// React state is stale and the auth guard may not re-run. Force a fresh reload
// so logged-out users can't reach protected routes via the browser Back button.
if ('pageshow' in window) {
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <TRPCProvider>
        <RealtimeProvider>
          <App />
        </RealtimeProvider>
      </TRPCProvider>
    </HashRouter>
  </StrictMode>,
)
