<#
.SYNOPSIS
  Trigger WorldWide sales backfill (GitHub Actions workflow_dispatch)

.DESCRIPTION
  อ่าน GH_PAT จาก deploy/.env.local แล้วสั่งรัน workflow "worldwide-sync.yml"
  แบบ backfill ตามช่วงวันที่ที่กำหนด · กัน range เกิน 5 วัน (XLSX/portal อาจตัดข้อมูล)
  ยอดขายใช้ upsert (on_conflict=sale_key) → กดซ้ำได้ ไม่เกิดข้อมูลซ้ำ

.PARAMETER From
  วันเริ่มต้น YYYY-MM-DD

.PARAMETER To
  วันสิ้นสุด YYYY-MM-DD (รวมวันนี้)

.EXAMPLE
  .\scripts\trigger-ww-backfill.ps1 -From 2026-06-03 -To 2026-06-06

.NOTES
  ต้องเติม GH_PAT (PAT ที่มี workflow scope) ใน deploy/.env.local ก่อน
  สร้าง PAT: github.com/settings/tokens → Generate new token (classic) → ติ๊ก scope "workflow"
#>
param(
  [Parameter(Mandatory = $true)][string]$From,
  [Parameter(Mandatory = $true)][string]$To,
  [string]$Workflow = "worldwide-sync.yml",
  [string]$Repo     = "divisionxcard/divisionX-Card",
  [string]$Ref      = "main"
)

$ErrorActionPreference = "Stop"

# ── 1. validate วันที่ + กัน range > 5 วัน (เช็ค input ก่อน เผื่อยังไม่มี token) ──
try { $d1 = [datetime]::ParseExact($From, "yyyy-MM-dd", $null) }
catch { throw "From ผิดรูปแบบ (ต้อง YYYY-MM-DD): $From" }
try { $d2 = [datetime]::ParseExact($To, "yyyy-MM-dd", $null) }
catch { throw "To ผิดรูปแบบ (ต้อง YYYY-MM-DD): $To" }
if ($d2 -lt $d1) { throw "To ($To) ต้องไม่ก่อน From ($From)" }
$span = ($d2 - $d1).Days + 1
if ($span -gt 5) { throw "ช่วง $span วัน เกินลิมิต 5 วัน/ครั้ง · แบ่งรันทีละ <=5 วัน (ดู CLAUDE.md)" }

# ── 2. อ่าน GH_PAT จาก deploy/.env.local ────────────────────────────
$envFile = Join-Path $PSScriptRoot "..\deploy\.env.local"
if (-not (Test-Path $envFile)) { throw "ไม่พบ $envFile" }
$patLine = Get-Content $envFile | Where-Object { $_ -match '^\s*GH_PAT\s*=' } | Select-Object -First 1
$pat = if ($patLine) { ($patLine -split '=', 2)[1].Trim() } else { "" }
if (-not $pat) {
  throw "GH_PAT ยังว่างใน deploy/.env.local · เติม PAT (workflow scope) ก่อน · ดู github.com/settings/tokens"
}

# ── 3. dispatch workflow ────────────────────────────────────────────
$headers = @{
  Authorization          = "Bearer $pat"
  Accept                 = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
  "User-Agent"           = "divisionx-cli"
}
$body = @{ ref = $Ref; inputs = @{ from_date = $From; to_date = $To } } | ConvertTo-Json
$dispatchUrl = "https://api.github.com/repos/$Repo/actions/workflows/$Workflow/dispatches"

Write-Host "Backfill ยอดขาย WW: $From -> $To ($span วัน) ..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri $dispatchUrl -Method Post -Headers $headers -Body $body -ContentType "application/json" | Out-Null
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  $detail = $_.ErrorDetails.Message
  if ($code -eq 401) { throw "401 Unauthorized · GH_PAT ไม่ถูกต้อง/หมดอายุ หรือไม่มี workflow scope`n$detail" }
  if ($code -eq 404) { throw "404 Not Found · ตรวจชื่อ repo/workflow หรือ PAT ไม่มีสิทธิ์เข้า repo`n$detail" }
  throw "Dispatch ล้มเหลว ($code): $detail"
}
Write-Host "[OK] สั่งรันแล้ว" -ForegroundColor Green

# ── 4. หา run ล่าสุดเพื่อให้ลิงก์ดู log ──────────────────────────────
Start-Sleep -Seconds 3
try {
  $runs = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/actions/workflows/$Workflow/runs?per_page=1" -Headers $headers
  $run = $runs.workflow_runs | Select-Object -First 1
  if ($run) {
    Write-Host "ดู progress: $($run.html_url)" -ForegroundColor Yellow
    Write-Host "สถานะ: $($run.status)"
  }
} catch {
  Write-Host "ดู progress ที่: https://github.com/$Repo/actions/workflows/$Workflow" -ForegroundColor Yellow
}
