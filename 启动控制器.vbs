Option Explicit
Dim fs, sh, folder, executable
Set fs = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
executable = folder & "\.venv\Scripts\pythonw.exe"
If Not fs.FileExists(executable) Then
  MsgBox "Please run setup.ps1 first.", 48, "Q36 Controller"
  WScript.Quit 1
End If
sh.CurrentDirectory = folder
sh.Run Chr(34) & executable & Chr(34) & " " & Chr(34) & folder & "\launch.py" & Chr(34), 0, False
