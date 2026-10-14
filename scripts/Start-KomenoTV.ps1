[CmdletBinding()]
param([switch]$Stop, [string]$Address = '100.119.2.23')

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot
$taskRuntime = Join-Path $taskRoot '.komeno'
$taskStatePath = Join-Path $taskRuntime 'processes.json'
$taskState = if (Test-Path -LiteralPath $taskStatePath) { Get-Content -LiteralPath $taskStatePath -Raw | ConvertFrom-Json } else { @() }
$taskOwned = @($taskState | ForEach-Object {
    $taskProcess = Get-Process -Id $_.id -ErrorAction SilentlyContinue
    # PID reuse must never target another process.
    if ($taskProcess -and $taskProcess.StartTime.ToUniversalTime().Ticks.ToString() -eq $_.started) { $taskProcess }
})
if ($Stop) {
    $taskOwned | Stop-Process
    Write-Output 'Stopped only the recorded KomenoTV processes.'
    return
}
$taskUrl = "https://$($Address.Replace('.', '-')).local.konomi.tv:7100/tv/"
if ($taskOwned.Count -eq 2) {
    $taskHealth = Invoke-RestMethod -Uri 'http://127.0.0.77:7110/health' -TimeoutSec 5
    if ($taskHealth.service -ne 'KomenoTV') { throw 'The recorded gateway is not healthy.' }
    Write-Output "KomenoTV is already running: $taskUrl"
    return
}
if ($taskOwned.Count -ne 0) { throw 'Partial KomenoTV startup. Run this script with -Stop, then start again.' }
foreach ($taskPort in 7100,7110) {
    if (Get-NetTCPConnection -State Listen -LocalPort $taskPort -ErrorAction SilentlyContinue) {
        throw "Port $taskPort is occupied. No existing service was changed."
    }
}
if (@(& tailscale.exe ip -4) -notcontains $Address) { throw "Tailscale address $Address is not active on this PC." }
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
$taskAkebi = 'C:\TV\KonomiTV\server\thirdparty\Akebi\akebi-https-server.exe'
foreach ($taskFile in $taskAkebi,(Join-Path $taskRoot 'client\dist-car\index.html')) {
    if (!(Test-Path -LiteralPath $taskFile -PathType Leaf)) { throw "Required file is missing: $taskFile" }
}
New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
$taskStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$taskStarted = @()
try {
    $taskStarted += Start-Process -FilePath $taskNode -ArgumentList ('"' + (Join-Path $PSScriptRoot 'car-gateway.mjs') + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime "gateway-$taskStamp.log") -RedirectStandardError (Join-Path $taskRuntime "gateway-$taskStamp.err.log")
    $taskStarted += Start-Process -FilePath $taskAkebi -ArgumentList @('--listen-address',"${Address}:7100",'--proxy-pass-url','http://127.0.0.77:7110/','--keyless-server-url','https://akebi.konomi.tv/') -WorkingDirectory $taskRuntime -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime "https-$taskStamp.log") -RedirectStandardError (Join-Path $taskRuntime "https-$taskStamp.err.log")
    @($taskStarted | ForEach-Object { @{ id = $_.Id; started = $_.StartTime.ToUniversalTime().Ticks.ToString() } }) | ConvertTo-Json | Set-Content -LiteralPath $taskStatePath -Encoding utf8
    $taskReady = $false
    for ($taskAttempt = 0; $taskAttempt -lt 15; $taskAttempt++) {
        Start-Sleep -Seconds 1
        if (@($taskStarted | Where-Object { $_.HasExited }).Count) { throw 'A KomenoTV process exited. See .komeno logs.' }
        try {
            $taskHealth = Invoke-RestMethod -Uri ($taskUrl.Replace('/tv/', '/health')) -TimeoutSec 3
            if ($taskHealth.service -eq 'KomenoTV') { $taskReady = $true; break }
        } catch { if ($taskAttempt -eq 14) { throw } }
    }
    if (!$taskReady) { throw 'KomenoTV HTTPS did not become ready.' }
    Write-Output "KomenoTV is ready: $taskUrl"
} catch {
    $taskStarted | Where-Object { !$_.HasExited } | Stop-Process
    throw
}
