# RES Print Helper

Prints receipts **directly** on the restaurant's Windows printers (no browser, nothing on screen).
The RES server sends the print jobs; this helper prints them on the chosen printer and
opens the cash drawer.

## Install (once, on the PC that has the printers)
1. Node.js 22 must be installed.
2. In RES: **Settings → Printers → Add helper** → copy the key (shown once).
3. Copy `config.example.json` to `config.json`, paste the key, and set `server`
   (`http://127.0.0.1:3000` when the server runs on this PC).
4. Run: `powershell -ExecutionPolicy Bypass -File install-startup.ps1`
   → it starts now (hidden) and with Windows from now on.
5. Back in RES: choose the **receipt printer** and press **Print test page**.

Log: `helper.log` in this folder. To stop it: Task Manager → node.exe → End task.
