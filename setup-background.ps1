param([switch]$Disable)
$ErrorActionPreference = 'Stop'
$controllerRoot = $PSScriptRoot
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'Q36 ChatGPT Controller.lnk'
if ($Disable) {
    if (Test-Path -LiteralPath $shortcutPath) {
        Remove-Item -LiteralPath $shortcutPath
    }
    Write-Output 'Q36 automatic startup disabled. The current listener continues until sign-out.'
    return
}
$pythonExecutable = Join-Path $controllerRoot '.venv\Scripts\pythonw.exe'
$launcherPath = Join-Path $controllerRoot 'launch.py'
if (!(Test-Path -LiteralPath $pythonExecutable)) { throw 'Run setup.ps1 first.' }
$windowsShell = New-Object -ComObject WScript.Shell
$shortcut = $windowsShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $pythonExecutable
$shortcut.Arguments = '"' + $launcherPath + '" --background'
$shortcut.WorkingDirectory = $controllerRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Q36 ChatGPT controller background listener'
$shortcut.Save()
Write-Output "Q36 automatic startup installed: $shortcutPath"
