$base = "c:\Users\shink\Desktop\AVITOLOG-CLAUDE"
$lines = [System.IO.File]::ReadAllLines("$base\js\app.js", [System.Text.Encoding]::UTF8)
# core: 1-1393
$core = $lines[0..1392] -join "`n"
[System.IO.File]::WriteAllText("$base\js\core.js", $core, [System.Text.Encoding]::UTF8)
# projects: 1394-4376
$projects = $lines[1393..4375] -join "`n"
[System.IO.File]::WriteAllText("$base\js\projects.js", $projects, [System.Text.Encoding]::UTF8)
# main: 4377-7725
$main = $lines[4376..7724] -join "`n"
[System.IO.File]::WriteAllText("$base\js\main.js", $main, [System.Text.Encoding]::UTF8)
Write-Host "Split done: core.js projects.js main.js"
