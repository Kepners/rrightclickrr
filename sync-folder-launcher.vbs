Set WshShell = CreateObject("WScript.Shell")
Set WshEnv = WshShell.Environment("PROCESS")
WshEnv.Remove("ELECTRON_RUN_AS_NODE")

strFolder = ""
If WScript.Arguments.Count > 0 Then
    strFolder = WScript.Arguments(0)
End If

strElectron = "C:\\Users\\kepne\\OneDrive\\Documents\\GitHub\\rrightclickrr\\node_modules\\electron\\dist\\electron.exe"
strApp = "C:\\Users\\kepne\\OneDrive\\Documents\\GitHub\\rrightclickrr"

strCmd = """" & strElectron & """ """ & strApp & """ --sync-folder """ & strFolder & """"
WshShell.Run strCmd, 0, False
