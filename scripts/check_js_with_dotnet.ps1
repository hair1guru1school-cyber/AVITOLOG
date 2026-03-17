$path = "C:\Users\shink\Desktop\AVITOLOG-CLAUDE\js\ads.js"
$code = [System.IO.File]::ReadAllText($path)
$provider = New-Object Microsoft.JScript.JScriptCodeProvider
$cp = New-Object System.CodeDom.Compiler.CompilerParameters
$cp.GenerateInMemory = $true
$res = $provider.CompileAssemblyFromSource($cp, $code)
if ($res.Errors.Count -eq 0) {
  Write-Output "OK: $path"
} else {
  $res.Errors | ForEach-Object {
    Write-Output ("Line {0}: {1}" -f $_.Line, $_.ErrorText)
  }
  exit 1
}
