@echo off
chcp 65001 >nul
REM ============================================================
REM  DivisionX Card - Backfill ยอดขาย WorldWide (ย้อนหลัง)
REM  วิธีใช้: ดับเบิลคลิกไฟล์นี้ แล้วใส่วันที่ตามที่ถาม
REM  ต้องเติม GH_PAT (workflow scope) ใน deploy\.env.local ก่อน
REM ============================================================

echo.
echo   ===== Backfill ยอดขาย WorldWide =====
echo   รูปแบบวันที่: YYYY-MM-DD  (ห้ามเกิน 5 วันต่อครั้ง)
echo.

set /p FROMD=  วันเริ่มต้น (from) :
set /p TOD=  วันสิ้นสุด (to)   :

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\trigger-ww-backfill.ps1" -From "%FROMD%" -To "%TOD%"

echo.
pause
