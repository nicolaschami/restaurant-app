; print-helper/installer/RES-Local.iss  —  makes RES-Local-Setup.exe  (offline POS, 2026-10-30)
;
; What the restaurant PC gets (agreed with the user: ONE file, about 5 minutes, done once):
;   - C:\RES-Local\RES-Local.exe  (Node + RES Local in one program, build/build-exe.mjs)
;     + raw-print.ps1 (printing) + nssm.exe (runs it as a Windows service)
;   - the Windows service "RES Local": starts with Windows, no window, restarts by itself
;   - a "RES POS" icon on the desktop → http://localhost:3901
;   - optional "This PC also serves POS 2": RES Local listens on the restaurant network
;     and the Windows Firewall lets the other POS in (port 3901, private network only)
; It asks: the server address (filled in) and the helper key (Settings → Printers → Add helper).
; Reinstall / update: the service is stopped, the program replaced, config.json and data\
; (the copy and any offline orders still waiting) are KEPT. Uninstall: Windows Settings →
; Apps → "RES Local" (data\ is kept on purpose: it may hold offline orders not sent yet).
;
; Build (after build/build-exe.mjs):
;   "E:\dev-tools\InnoSetup\ISCC.exe" installer\RES-Local.iss
;   test build for another server:  ISCC.exe /DDefaultServer=http://1.2.3.4:3100 installer\RES-Local.iss

#define AppVersion "1.2.0"
#ifndef DefaultServer
  #define DefaultServer "http://206.72.202.107:3000"
#endif
#define BuildOut "..\build\out"
#define Nssm "E:\dev-tools\nssm\nssm.exe"
#define Service "RESLocal"

[Setup]
AppId={{F3A6C1D2-7B84-4E59-9C1A-2D6E8B0F4A11}
AppName=RES Local
AppVersion={#AppVersion}
AppPublisher=RES POS
AppComments=Keeps the POS working when the internet is down, and prints the receipts and kitchen tickets.
DefaultDirName=C:\RES-Local
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#BuildOut}
OutputBaseFilename=RES-Local-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=RES Local (offline POS)
UninstallDisplayIcon={app}\RES-Local.exe
SetupLogging=yes

[Files]
Source: "{#BuildOut}\RES-Local.exe"; DestDir: "{app}"; Flags: ignoreversion; AfterInstall: WriteConfig
Source: "{#BuildOut}\raw-print.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Nssm}"; DestDir: "{app}"; Flags: ignoreversion

[INI]
; the desktop icon: a web shortcut to the POS through RES Local
Filename: "{commondesktop}\RES POS.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:3901"

[Run]
; the Windows service (removed first, so a reinstall starts clean)
Filename: "{app}\nssm.exe"; Parameters: "stop {#Service}"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "remove {#Service} confirm"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "install {#Service} ""{app}\RES-Local.exe"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set {#Service} AppDirectory ""{app}"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set {#Service} DisplayName ""RES Local"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set {#Service} Description ""RES POS: offline mode and printing (http://localhost:3901)"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set {#Service} Start SERVICE_AUTO_START"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set {#Service} AppStdout ""{app}\service.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set {#Service} AppStderr ""{app}\service.log"""; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set {#Service} AppRotateFiles 1"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set {#Service} AppRotateOnline 1"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set {#Service} AppRotateBytes 10485760"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set {#Service} AppExit Default Restart"; Flags: runhidden waituntilterminated
Filename: "{app}\nssm.exe"; Parameters: "set {#Service} AppRestartDelay 5000"; Flags: runhidden waituntilterminated
; POS 2: the firewall rule (only when the box was ticked)
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""RES Local (POS 2)"""; Flags: runhidden waituntilterminated
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""RES Local (POS 2)"" dir=in action=allow protocol=TCP localport=3901 profile=private"; Flags: runhidden waituntilterminated; Check: ServesPos2
Filename: "{app}\nssm.exe"; Parameters: "start {#Service}"; Flags: runhidden waituntilterminated
Filename: "http://localhost:3901"; Description: "Open the POS now"; Flags: shellexec postinstall nowait skipifsilent

[UninstallRun]
Filename: "{app}\nssm.exe"; Parameters: "stop {#Service}"; Flags: runhidden waituntilterminated; RunOnceId: "StopService"
Filename: "{app}\nssm.exe"; Parameters: "remove {#Service} confirm"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""RES Local (POS 2)"""; Flags: runhidden waituntilterminated; RunOnceId: "RemoveFirewall"

[UninstallDelete]
Type: files; Name: "{commondesktop}\RES POS.url"

[Code]
var
  ConfigPage: TInputQueryWizardPage;
  Pos2Page: TInputOptionWizardPage;

function HasConfig(): Boolean;
begin
  Result := FileExists(ExpandConstant('{app}\config.json'));
end;

procedure InitializeWizard();
begin
  ConfigPage := CreateInputQueryPage(wpWelcome, 'Connection to RES',
    'The server and the helper key of this restaurant',
    'The helper key comes from RES: Settings -> Printers -> Add helper (it is shown only once). ' +
    'When updating an installed RES Local, leave the key empty to keep the current one.');
  ConfigPage.Add('Server address:', False);
  ConfigPage.Add('Helper key (starts with rph_):', False);
  ConfigPage.Values[0] := '{#DefaultServer}';

  Pos2Page := CreateInputOptionPage(ConfigPage.ID, 'Second POS',
    'Will another POS (POS 2) use this PC?',
    'Tick it only on the PC with the printers, when the restaurant has a second POS. ' +
    'POS 2 then opens the POS at http://<this PC''s address>:3901.', False, False);
  Pos2Page.Add('This PC also serves POS 2 (opens port 3901 on the restaurant network)');
end;

// the key: rph_ + letters and digits only (so config.json stays valid)
function KeyIsValid(K: String): Boolean;
var
  I: Integer;
begin
  Result := (Length(K) >= 20) and (Copy(K, 1, 4) = 'rph_');
  if Result then
    for I := 5 to Length(K) do
      if Pos(K[I], '0123456789abcdefABCDEF') = 0 then Result := False;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  S, K: String;
begin
  Result := True;
  if CurPageID = ConfigPage.ID then
  begin
    S := Trim(ConfigPage.Values[0]);
    K := Trim(ConfigPage.Values[1]);
    if ((Copy(S, 1, 7) <> 'http://') and (Copy(S, 1, 8) <> 'https://')) or (Pos('"', S) > 0) or (Pos(' ', S) > 0) then
    begin
      MsgBox('Enter the server address, for example {#DefaultServer}', mbError, MB_OK);
      Result := False;
    end
    else if (K = '') and not HasConfig() then
    begin
      MsgBox('Paste the helper key (from RES: Settings -> Printers -> Add helper).', mbError, MB_OK);
      Result := False;
    end
    else if (K <> '') and not KeyIsValid(K) then
    begin
      MsgBox('This is not a helper key. It starts with rph_ followed by letters and digits.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function ServesPos2(): Boolean;
begin
  Result := Pos2Page.Values[0];
end;

// config.json next to RES-Local.exe (kept as it is when updating without a new key)
procedure WriteConfig();
var
  S, K, Lan: String;
begin
  S := Trim(ConfigPage.Values[0]);
  K := Trim(ConfigPage.Values[1]);
  if (K = '') and HasConfig() then Exit;
  if ServesPos2() then Lan := 'true' else Lan := 'false';
  SaveStringToFile(ExpandConstant('{app}\config.json'),
    '{' + #13#10 +
    '  "server": "' + S + '",' + #13#10 +
    '  "key": "' + K + '",' + #13#10 +
    '  "localPort": 3901,' + #13#10 +
    '  "lan": ' + Lan + #13#10 +
    '}' + #13#10, False);
end;

// an update: stop the running service first, so RES-Local.exe can be replaced
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  if FileExists(ExpandConstant('{app}\nssm.exe')) then
    Exec(ExpandConstant('{app}\nssm.exe'), 'stop {#Service}', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Result := '';
end;
