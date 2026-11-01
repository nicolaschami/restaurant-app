import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import CustomerChat from './pages/CustomerChat'
import Toaster from './components/Toaster'
import ConfirmHost from './components/ConfirmHost'
import { Buffer } from 'buffer';

(window as any).Buffer = (window as any).Buffer || Buffer; // Node-style Buffer for a few libraries

// /chat/<restaurant code> = the customers' chat order page (no login, 2026-11-01);
// every other address is the staff app.
const chatCode = window.location.pathname.match(/^\/chat\/([a-z0-9-]+)\/?$/i)?.[1];

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {chatCode ? <CustomerChat code={chatCode} /> : <App />}
    {/* green / red notifications at the top right, for every screen */}
    <Toaster />
    <ConfirmHost />
  </React.StrictMode>,
)