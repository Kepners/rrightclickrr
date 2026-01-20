' RRightclickrr Launcher - spawns app detached to prevent EPIPE from Explorer
' This script is called by the context menu, then launches the actual exe
' with detached stdio to avoid broken pipe errors when Explorer closes

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script lives
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = fso.BuildPath(scriptDir, "RRightclickrr.exe")

' Build command line with all arguments passed to this script
args = ""
For i = 0 To WScript.Arguments.Count - 1
    args = args & " """ & WScript.Arguments(i) & """"
Next

' Run the app minimized (0) and don't wait (False)
' This effectively "detaches" from Explorer's process tree
WshShell.Run """" & exePath & """" & args, 0, False
