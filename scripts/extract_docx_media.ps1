$tmp = "C:\Users\shink\AppData\Local\Temp\docx_extract_1111"
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Path $tmp | Out-Null
$zip = Join-Path $tmp "1111.zip"
Copy-Item "C:\Users\shink\Downloads\1111.docx" $zip
Expand-Archive -Path $zip -DestinationPath $tmp
Get-ChildItem (Join-Path $tmp "word\media") | Select-Object Name, Length | Sort-Object Length -Descending
