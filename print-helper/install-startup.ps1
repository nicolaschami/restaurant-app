# print-helper/install-startup.ps1
# Makes the RES Print Helper start by itself (hidden) every time Windows starts,
# and starts it now. Run once:  powershell -ExecutionPolicy Bypass -File install-startup.ps1
# The helper needs Node 22 or newer (it uses Node's built-in WebSocket).
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Find a Node 22+ : the dev tools folder first, then every "node" on the PATH.
$candidates = @('E:\dev-tools\node22\node.exe') + @(Get-Command node -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source })
$node = $null
foreach ($c in $candidates) {
  if ($c -and (Test-Path $c)) {
    $major = [int](((& $c --version) -replace '^v', '').Split('.')[0])
    if ($major -ge 22) { $node = $c; break }
  }
}
if (-not $node) { Write-Error 'Node.js 22 or newer was not found. Install Node.js 22 first.'; exit 1 }
Set-Content -Path (Join-Path $here 'node-path.txt') -Value $node -Encoding ASCII -NoNewline

$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path $startup 'RES Print Helper.lnk'))
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = '"' + (Join-Path $here 'start-hidden.vbs') + '"'
$lnk.WorkingDirectory = $here
$lnk.Description = 'RES Print Helper (prints receipts directly)'
$lnk.Save()
Start-Process wscript.exe -ArgumentList ('"' + (Join-Path $here 'start-hidden.vbs') + '"')
"RES Print Helper installed with " + $node + " : it starts with Windows, and is running now. Log: " + (Join-Path $here 'helper.log')
