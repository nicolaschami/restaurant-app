import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import Toaster from './components/Toaster'
import ConfirmHost from './components/ConfirmHost'
import { Buffer } from 'buffer';

(window as any).Buffer = (window as any).Buffer || Buffer; // Node-style Buffer for a few libraries

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    {/* green / red notifications at the top right, for every screen */}
    <Toaster />
    <ConfirmHost />
  </React.StrictMode>,
)