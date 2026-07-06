# Reinicia BadBoy si se congeló (mata procesos y relanza).
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $scriptDir "run-badboy-local.ps1")
