#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Extracts Caddy's local root CA certificate and installs it in the
  Windows Trusted Root Certification Authorities store.

.DESCRIPTION
  Run this once after the first `npm run dev` so browsers trust
  https://everything.test. Requires Administrator privileges.

.EXAMPLE
  # From an elevated PowerShell prompt:
  .\scripts\trust-caddy-ca.ps1
#>

$ErrorActionPreference = "Stop"

$tempCert = Join-Path $env:TEMP "caddy-root-ca.crt"

Write-Host "Extracting Caddy root CA from Docker volume..."
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt $tempCert

if (-not (Test-Path $tempCert)) {
    Write-Error "Failed to extract certificate. Is the Caddy container running? Try 'npm run dev' first."
    exit 1
}

Write-Host "Installing certificate into Trusted Root Certification Authorities..."
Import-Certificate -FilePath $tempCert -CertStoreLocation Cert:\LocalMachine\Root | Out-Null

Remove-Item $tempCert -Force
Write-Host "Done. Browsers will now trust https://everything.test."
Write-Host "You may need to restart your browser for the change to take effect."
