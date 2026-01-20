Set WshShell = CreateObject("WScript.Shell")
Set WshEnv = WshShell.Environment("PROCESS")
WshEnv.Remove("ELECTRON_RUN_AS_NODE")

' Get the folder path from arguments
strFolder = ""
If WScript.Arguments.Count > 0 Then
    strFolder = WScript.Arguments(0)
End If

strElectron = "C:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\node_modules\electron\dist\electron.exe"
strApp = "C:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr"

' Build command - ensure folder path is quoted properly
strCmd = """" & strElectron & """ """ & strApp & """ --sync-folder """ & strFolder & """"

' Debug: Write to log file
Set fso = CreateObject("Scripting.FileSystemObject")
Set logFile = fso.OpenTextFile("C:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\sync-debug.log", 8, True)
logFile.WriteLine Now & " - Command: " & strCmd
logFile.WriteLine Now & " - Folder: " & strFolder
logFile.Close

WshShell.Run strCmd, 0, False
