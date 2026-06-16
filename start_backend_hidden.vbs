Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\shink\Desktop\AVITOLOG-CLAUDE\start_backend_guard.ps1""", 0, False
