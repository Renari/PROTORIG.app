$cachePath = Join-Path $env:LOCALAPPDATA "PlatformProcess\Cache\data_1"

if (-not (Test-Path $cachePath)) {
    Write-Host "Could not find data_1 at: $cachePath" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    return
}

Write-Host "Reading $cachePath..."

$stream = [System.IO.File]::Open(
    $cachePath,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
)
try {
    $bytes = New-Object byte[] $stream.Length
    [void]$stream.Read($bytes, 0, $bytes.Length)
} finally {
    $stream.Close()
}
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

$text = $text -replace '\\u0026', '&'
$text = $text -replace '\\/', '/'
$text = $text -replace '&amp;', '&'

$urlMatches = [regex]::Matches($text, 'https?://[^\s"''<>\\]+u8_token=[^\s"''<>\\]+')

if ($urlMatches.Count -eq 0) {
    Write-Host "No URL containing u8_token was found in data_1." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    return
}

$url = $urlMatches[$urlMatches.Count - 1].Value

Write-Host ""
Write-Host ("{0}" -f ([char]0x2501) * 50)
Write-Host " URL: $url"
Write-Host ("{0}" -f ([char]0x2501) * 50)

Set-Clipboard -Value $url
Write-Host ""
Write-Host "Copied to clipboard." -ForegroundColor Green
Read-Host "Press Enter to exit"
