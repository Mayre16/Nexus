# Funciones compartidas para arranque oculto del agente BadBoy.
$script:BadBoyTaskName = "ADESA BadBoy Agent"
$script:BadBoyRunKeyName = "ADESABadBoyAgent"
$script:BadBoyPipePath = "\\.\pipe\MonitorSuitePipe"

function Stop-BadBoyProcesses {
    Get-Process -Name "MonitorSuite.Service", "MonitorSuite.Admin" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
}

function Test-BadBoyPipe {
    Test-Path $script:BadBoyPipePath
}

function Wait-BadBoyPipe {
    param([int]$Seconds = 15)
    for ($i = 0; $i -lt ($Seconds * 2); $i++) {
        if (Test-BadBoyPipe) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Start-BadBoyAgentHidden {
    param(
        [Parameter(Mandatory = $true)][string]$ServiceExe,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )
    Start-Process -FilePath $ServiceExe -WorkingDirectory $WorkingDirectory -WindowStyle Hidden
}

function Unregister-BadBoyAutoStart {
    param([string]$TaskName = $script:BadBoyTaskName)

    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" `
        -Name $script:BadBoyRunKeyName -ErrorAction SilentlyContinue
}

function Register-BadBoyAutoStart {
    param(
        [Parameter(Mandatory = $true)][string]$ServiceExe,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [string]$TaskName = $script:BadBoyTaskName,
        [switch]$UseHighestRunLevel
    )

    Unregister-BadBoyAutoStart -TaskName $TaskName

    $action = New-ScheduledTaskAction -Execute $ServiceExe -WorkingDirectory $WorkingDirectory
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)

    $runLevel = if ($UseHighestRunLevel) { "Highest" } else { "Limited" }
    $principal = New-ScheduledTaskPrincipal `
        -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive `
        -RunLevel $runLevel

    try {
        Register-ScheduledTask `
            -TaskName $TaskName `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -Principal $principal `
            -Description "Agente ADESA BadBoy (MonitorSuite, sin ventana)" | Out-Null
        return "scheduled-task"
    } catch {
        # Respaldo: registro Run. Con OutputType WinExe no muestra ventana CMD.
        Set-ItemProperty `
            -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" `
            -Name $script:BadBoyRunKeyName `
            -Value "`"$ServiceExe`""
        return "registry-run"
    }
}

function Resolve-BadBoyInstallDir {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\ADESA\BadBoy"),
        "$env:ProgramFiles\ADESA\BadBoy"
    )
    foreach ($dir in $candidates) {
        $exe = Join-Path $dir "MonitorSuite.Service.exe"
        if (Test-Path $exe) { return $dir }
    }
    return $null
}
