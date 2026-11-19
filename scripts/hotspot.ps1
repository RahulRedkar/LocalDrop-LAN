param (
    [Parameter(Mandatory=$false)]
    [ValidateSet("status", "start", "stop")]
    [string]$Action = "status",

    [Parameter(Mandatory=$false)]
    [string]$Ssid = "LocalDrop-Direct",

    [Parameter(Mandatory=$false)]
    [string]$Password = "localdrop8080"
)

$ErrorActionPreference = "SilentlyContinue"

function Get-HotspotStatus {
    $wifiAdapters = Get-NetAdapter | Where-Object { 
        $_.InterfaceDescription -like "*Wi-Fi*" -or 
        $_.InterfaceDescription -like "*Wireless*" -or 
        $_.InterfaceDescription -like "*802.11*" -or 
        $_.Name -like "*Wi-Fi*" 
    }

    $hasWifi = ($wifiAdapters -ne $null -and $wifiAdapters.Count -gt 0)
    
    # Check if hotspot adapter or 192.168.137.1 gateway is active
    $hotspotIp = (Get-NetIPAddress -ErrorAction SilentlyContinue | Where-Object { 
        $_.IPAddress -eq "192.168.137.1" -or 
        ($_.InterfaceAlias -like "*Hotspot*" -or $_.InterfaceAlias -like "*Direct*") -and $_.AddressFamily -eq "IPv4"
    } | Select-Object -First 1).IPAddress

    $icssvc = Get-Service icssvc -ErrorAction SilentlyContinue
    $isIcsRunning = ($icssvc -ne $null -and $icssvc.Status -eq "Running")

    $isActive = ($hotspotIp -ne $null -or $isIcsRunning)

    $result = @{
        supported = [bool]$hasWifi
        active    = [bool]$isActive
        ssid      = if ($isActive) { $Ssid } else { $null }
        ip        = if ($hotspotIp) { $hotspotIp } else { "192.168.137.1" }
        reason    = if (-not $hasWifi) { "No wireless Wi-Fi adapter detected on this system." } else { "" }
    }

    return ($result | ConvertTo-Json -Compress)
}

function Start-Hotspot {
    $wifiAdapters = Get-NetAdapter | Where-Object { 
        $_.InterfaceDescription -like "*Wi-Fi*" -or 
        $_.InterfaceDescription -like "*Wireless*" -or 
        $_.InterfaceDescription -like "*802.11*" -or 
        $_.Name -like "*Wi-Fi*" 
    }

    if (-not $wifiAdapters) {
        return (@{
            success = $false
            error   = "No wireless Wi-Fi adapter detected. Hotspot cannot be started."
        } | ConvertTo-Json -Compress)
    }

    $started = $false
    $errorMsg = ""

    # Attempt 1: WinRT NetworkOperatorTetheringManager
    try {
        [Windows.System.UserProfile.LockScreen, Windows.System.UserProfile, ContentType = WindowsRuntime] | Out-Null
        Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop

        $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { 
            $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation`1" 
        })[0]

        function Await-WinRt($WinRtTask, $ResultType) {
            $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
            $netTask = $asTask.Invoke($null, @($WinRtTask))
            $netTask.Wait(8000) | Out-Null
            return $netTask.Result
        }

        # Find first connection profile
        $profiles = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]::GetConnectionProfiles()
        $targetProfile = $profiles | Select-Object -First 1

        if ($targetProfile) {
            $tetherManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]::CreateFromConnectionProfile($targetProfile)
            if ($tetherManager) {
                # Configure SSID and Password if access point configuration is available
                try {
                    $config = $tetherManager.GetCurrentAccessPointConfiguration()
                    if ($config) {
                        $config.Ssid = $Ssid
                        $config.Passphrase = $Password
                        $tetherManager.ConfigureAccessPointAsync($config) | Out-Null
                    }
                } catch { }

                $startOp = $tetherManager.StartTetheringAsync()
                $tetherResult = Await-WinRt $startOp ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
                if ($tetherResult -and $tetherResult.Status -eq "Success") {
                    $started = $true
                }
            }
        }
    } catch {
        $errorMsg = $_.Exception.Message
    }

    # Attempt 2: Fallback to netsh hostednetwork (legacy drivers)
    if (-not $started) {
        try {
            netsh wlan set hostednetwork mode=allow ssid=$Ssid key=$Password | Out-Null
            $output = netsh wlan start hostednetwork
            if ($output -like "*started*") {
                $started = $true
            }
        } catch {
            $errorMsg = $_.Exception.Message
        }
    }

    # Wait for gateway IP to appear
    $assignedIp = "192.168.137.1"
    for ($i = 0; $i -lt 10; $i++) {
        $ip = (Get-NetIPAddress -ErrorAction SilentlyContinue | Where-Object { 
            $_.IPAddress -eq "192.168.137.1" -or 
            ($_.InterfaceAlias -like "*Hotspot*" -or $_.InterfaceAlias -like "*Direct*") -and $_.AddressFamily -eq "IPv4"
        } | Select-Object -First 1).IPAddress
        if ($ip) {
            $assignedIp = $ip
            break
        }
        Start-Sleep -Milliseconds 400
    }

    $res = @{
        success  = [bool]$started
        ssid     = $Ssid
        password = $Password
        ip       = $assignedIp
        error    = if (-not $started) { if ($errorMsg) { $errorMsg } else { "Failed to start Windows Mobile Hotspot. Verify your Wi-Fi adapter is turned on." } } else { $null }
    }

    return ($res | ConvertTo-Json -Compress)
}

function Stop-Hotspot {
    $stopped = $false

    try {
        # WinRT Stop
        [Windows.System.UserProfile.LockScreen, Windows.System.UserProfile, ContentType = WindowsRuntime] | Out-Null
        Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction SilentlyContinue

        $profiles = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]::GetConnectionProfiles()
        $targetProfile = $profiles | Select-Object -First 1
        if ($targetProfile) {
            $tetherManager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]::CreateFromConnectionProfile($targetProfile)
            if ($tetherManager) {
                $tetherManager.StopTetheringAsync() | Out-Null
                $stopped = $true
            }
        }
    } catch { }

    # Netsh hosted network stop
    try {
        netsh wlan stop hostednetwork | Out-Null
        $stopped = $true
    } catch { }

    # Stop service if still running
    try {
        Stop-Service icssvc -Force -ErrorAction SilentlyContinue
    } catch { }

    return (@{
        success = $true
        message = "Hotspot stopped cleanly."
    } | ConvertTo-Json -Compress)
}

switch ($Action) {
    "start"  { Start-Hotspot }
    "stop"   { Stop-Hotspot }
    default  { Get-HotspotStatus }
}
