var fso = new ActiveXObject("Scripting.FileSystemObject");
var path = WScript.Arguments.length ? WScript.Arguments.Item(0) : "C:\\Users\\shink\\Desktop\\AVITOLOG-CLAUDE\\js\\ads.js";
if (!fso.FileExists(path)) {
  WScript.Echo("File not found: " + path);
  WScript.Quit(2);
}
var file = fso.OpenTextFile(path, 1);
var src = file.ReadAll();
file.Close();
try {
  new Function(src);
  WScript.Echo("OK: " + path);
  WScript.Quit(0);
} catch (e) {
  WScript.Echo("Syntax error in: " + path);
  WScript.Echo("Message: " + e.message);
  WScript.Quit(1);
}
