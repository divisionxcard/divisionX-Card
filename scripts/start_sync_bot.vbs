' สตาร์ทบอทปุ่มซิงค์แบบไม่โผล่หน้าต่างดำ — ใช้กับ Startup ของ Windows
'
' ทำไมต้องเป็น .vbs: ถ้าใส่ .bat ลง Startup โดยตรง จะมีหน้าต่าง console ค้าง
' อยู่บนจอตลอดเวลา (ปิดทีบอทตายที) ตัวนี้สั่งรันแบบซ่อนหน้าต่าง (0) แทน
'
' ติดตั้ง: กด Win+R พิมพ์ shell:startup แล้ววาง "ทางลัด" ของไฟล์นี้ไว้ในโฟลเดอร์นั้น
' หยุดบอท: Task Manager → หา python.exe ที่รัน telegram_sync_bot → End task

Dim shell, fso, here, repo
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)   ' ...\scripts
repo = fso.GetParentFolderName(here)                     ' ราก repo

shell.CurrentDirectory = repo
shell.Run """" & repo & "\.venv-image\Scripts\pythonw.exe"" """ & _
          here & "\telegram_sync_bot.py""", 0, False
