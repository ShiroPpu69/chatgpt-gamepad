param([switch]$Disable)
$ErrorActionPreference = 'Stop'
$controllerRoot = $PSScriptRoot
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'Q36 ChatGPT Controller.lnk'
$recoveryTaskName = 'Q36 ChatGPT Background Recovery'
if ($Disable) {
    if (Test-Path -LiteralPath $shortcutPath) {
        Remove-Item -LiteralPath $shortcutPath
    }
    $recoveryTask = Get-ScheduledTask -TaskName $recoveryTaskName -ErrorAction SilentlyContinue
    if ($recoveryTask) {
        Unregister-ScheduledTask -TaskName $recoveryTaskName -Confirm:$false
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
# The startup shortcut runs only at sign-in. A repeating task also restores
# an exited listener. The bridge binds before gamepad polling starts, so
# duplicate launches cannot produce duplicate button actions.
try {
    $recoveryAction = New-ScheduledTaskAction -Execute $pythonExecutable -Argument ('"' + $launcherPath + '" --background') -WorkingDirectory $controllerRoot
    $recoveryTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $recoverySettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
    $recoveryPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $recoveryTaskName -Action $recoveryAction -Trigger $recoveryTrigger -Settings $recoverySettings -Principal $recoveryPrincipal -Description 'Restore the local Q36 background listener if it is no longer running.' -Force | Out-Null
    Write-Output 'Q36 recovery check installed (every minute while signed in).'
} catch {
    Write-Warning ('Login startup is installed, but the recovery task could not be registered: ' + $_.Exception.Message)
}
