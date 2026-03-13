Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
DesktopPath = WshShell.SpecialFolders("Desktop")
batPath = scriptDir & "\ОБНОВИТЬ САЙТ.bat"

Set Shortcut = WshShell.CreateShortcut(DesktopPath & "\ОБНОВИТЬ САЙТ.lnk")
Shortcut.TargetPath = "cmd.exe"
Shortcut.Arguments = "/k """ & batPath & """"
Shortcut.WorkingDirectory = scriptDir
Shortcut.Description = "Obnovlenie sayta - okno ostayotsya otkrytym"
Shortcut.IconLocation = "shell32.dll,167"
Shortcut.Save

WScript.Echo "Yarlyk sozdan na rabochem stole."
