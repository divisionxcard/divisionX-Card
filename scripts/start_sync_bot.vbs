' สตาร์ทบอทปุ่มซิงค์แบบไม่โผล่หน้าต่างดำ — ใช้กับ Startup ของ Windows และเป็นตัวเฝ้าด้วย
'
' ทำไมต้องเป็น .vbs: ถ้าใส่ .bat ลง Startup โดยตรง จะมีหน้าต่าง console ค้าง
' อยู่บนจอตลอดเวลา (ปิดทีบอทตายที) ตัวนี้สั่งรันแบบซ่อนหน้าต่าง (0) แทน
'
' ⚠️ ตั้งแต่ 13 ก.ย. 2026 บอทตัวนี้ไม่ได้เป็นแค่ "ปุ่มกด" แล้ว — มันถือตัวจับเวลา
' ซิงค์อัตโนมัติเที่ยงคืนไว้ด้วย (แทน cron ของ GitHub ที่ใช้ไม่ได้) บอทตาย =
' ยอดขายหยุดเข้าแบบเงียบสนิท จึงต้องมีคนคอยปลุก ไฟล์นี้เลยทำสองหน้าที่:
'   1) สตาร์ตตอนล็อกอิน (ทางลัดใน shell:startup)
'   2) เป็นตัวเฝ้าที่ Task Scheduler เรียกซ้ำทุก 15 นาที (งาน "DVX Sync Bot Watchdog")
' ⚠️ จึงต้อง **ไม่สตาร์ตซ้ำถ้ามันรันอยู่แล้ว** — บอทสองตัวจะแย่งกันดึงข้อความจาก
'   Telegram (ตัวเดียวเท่านั้นที่ getUpdates ได้) กดปุ่มแล้วจะเงียบเป็นครั้งคราว
'
' ติดตั้ง: กด Win+R พิมพ์ shell:startup แล้ววาง "ทางลัด" ของไฟล์นี้ไว้ในโฟลเดอร์นั้น
' หยุดบอท: Task Manager → หา python.exe ที่รัน telegram_sync_bot → End task
'          (ถ้าตัวเฝ้ายังทำงาน มันจะปลุกกลับมาภายใน 15 นาที — ปิดงานใน Task Scheduler ด้วย)

Dim shell, fso, here, repo, wmi, procs
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\scripts
repo = fso.GetParentFolderName(here)                     ' ราก repo

' รันอยู่แล้วหรือยัง — ถามจาก command line ของทุก process
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
' [_] คือวิธีหนีอักขระของ WQL — ปล่อย _ ไว้เฉย ๆ มันแปลว่า "ตัวอักษรอะไรก็ได้ 1 ตัว"
' ต้องล็อก Name เป็น python ด้วย ไม่งั้น shell ที่ "เคยพิมพ์ชื่อไฟล์นี้" ก็เข้าข่าย
' แล้วตัวเฝ้าจะเห็นว่าบอทยังอยู่ทั้งที่ตายไปแล้ว — ตรวจแล้วเจอจริงตอนทดสอบ
Set procs = wmi.ExecQuery( _
    "SELECT ProcessId FROM Win32_Process WHERE Name LIKE 'python%'" & _
    " AND CommandLine LIKE '%telegram[_]sync[_]bot%'")
If procs.Count > 0 Then
    WScript.Quit 0        ' มีชีวิตอยู่แล้ว ไม่ต้องทำอะไร
End If

shell.CurrentDirectory = repo
shell.Run """" & repo & "\.venv-image\Scripts\pythonw.exe"" """ & _
          here & "\telegram_sync_bot.py""", 0, False
