# Loop 1+2 — รีเฟรช AI Insights → บรีฟการตลาด + ร่างคอนเทนต์ → Telegram
# ใช้ Ollama local (ฟรี) → รันในเครื่องที่มี Ollama เท่านั้น
#
# ตั้ง Windows Task Scheduler รายสัปดาห์ (จันทร์ 08:30):
#   schtasks /create /tn "DivisionX Weekly Brief" /tr "powershell -File 'c:\Projects\divisionX Card\deploy\agents\run_weekly_brief.ps1'" /sc weekly /d MON /st 08:30
#
# ต้องมีใน deploy/.env.local: SUPABASE_URL, SUPABASE_SERVICE_KEY,
#   TELEGRAM_MKT_BOT_TOKEN, TELEGRAM_MKT_CHAT_ID   (agent โหลด .env.local ให้อัตโนมัติ)
# ต้องมี Ollama รันอยู่ + model qwen2.5:7b

$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[1/2] รีเฟรช AI Insights (sku_profile_agent · Ollama)..."
py "$dir\sku_profile_agent.py"

Write-Host "[2/3] ส่งบรีฟการตลาดเข้า Telegram..."
py "$dir\weekly_marketing_brief.py"

Write-Host "[3/3] ร่างคอนเทนต์จาก SKU มาแรง (รออนุมัติ)..."
py "$dir\content_suggester.py"

Write-Host "เสร็จ — ตรวจ Telegram กลุ่มการตลาด (บรีฟ + ร่างคอนเทนต์)"
