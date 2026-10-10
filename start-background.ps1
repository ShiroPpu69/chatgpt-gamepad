$ErrorActionPreference = 'Stop'
$pythonExecutable = Join-Path $PSScriptRoot '.venv\Scripts\pythonw.exe'
$launcherPath = Join-Path $PSScriptRoot 'launch.py'
if (!(Test-Path -LiteralPath $pythonExecutable)) { throw 'Run setup.ps1 first.' }
Start-Process -FilePath $pythonExecutable -ArgumentList ('"' + $launcherPath + '" --background') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Write-Output 'Background listener requested. The extension popup shows connection status.'
