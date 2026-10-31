import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthGate } from './AuthGate.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { ToastProvider } from './components/ToastProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
)
