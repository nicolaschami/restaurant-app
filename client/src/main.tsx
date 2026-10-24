import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import Toaster from './components/Toaster'
import { Buffer } from 'buffer';

window.Buffer = window.Buffer || Buffer;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    {/* green / red notifications at the top right, for every screen */}
    <Toaster />
  </React.StrictMode>,
)