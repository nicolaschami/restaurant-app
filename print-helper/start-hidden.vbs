' print-helper/start-hidden.vbs
' Starts the RES Print Helper with NO window (it runs in the background).
' To stop it: Task Manager → Details → node.exe (the one running helper.mjs) → End task.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
node = "node"
If fso.FileExists(here & "\node-path.txt") Then node = Trim(Replace(Replace(fso.OpenTextFile(here & "\node-path.txt").ReadAll, vbCr, ""), vbLf, ""))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = here
sh.Run """" & node & """ """ & here & "\helper.mjs""", 0, False
