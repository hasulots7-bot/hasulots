Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Change current directory to project folder
WshShell.CurrentDirectory = strPath

' Optional: Launch-QuickPrint.vbs admin  |  Launch-QuickPrint.vbs owner
Dim forcedRole
forcedRole = ""
For Each arg In WScript.Arguments
    If LCase(arg) = "admin" Then forcedRole = "admin"
    If LCase(arg) = "owner" Then forcedRole = "owner"
Next

' Check if node server is responding on port 4000
Dim http
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP")
http.Open "GET", "http://localhost:4000/api/info", False
http.Send

If Err.Number <> 0 Or http.Status <> 200 Then
    ' Start server silently in background (0 = hide black window)
    WshShell.Run "cmd /c node server.js", 0, False
    WScript.Sleep 3000
End If
On Error GoTo 0

' Work out whether this PC is a Shop Owner PC or a Platform Admin PC.
Dim role
role = LCase(forcedRole)

If role <> "admin" And role <> "owner" Then
    Dim roleFile
    roleFile = fso.BuildPath(strPath, "data\role.txt")
    If fso.FileExists(roleFile) Then
        Dim ts
        Set ts = fso.OpenTextFile(roleFile, 1)
        role = LCase(Trim(ts.ReadAll))
        ts.Close
    End If
End If

If role <> "admin" And role <> "owner" Then
    On Error Resume Next
    http.Open "GET", "http://localhost:4000/api/role", False
    http.Send
    If Err.Number = 0 And http.Status = 200 Then
        role = LCase(Trim(http.responseText))
    End If
    On Error GoTo 0
End If

Dim page
page = "/owner"
If role = "admin" Then page = "/admin"

' Determine Browser Path for Native App Window Mode
Dim browserPath
If fso.FileExists("C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe") Then
    browserPath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
ElseIf fso.FileExists("C:\Program Files\Microsoft\Edge\Application\msedge.exe") Then
    browserPath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
ElseIf fso.FileExists("C:\Program Files\Google\Chrome\Application\chrome.exe") Then
    browserPath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
ElseIf fso.FileExists("C:\Program Files (x86)\Google\Chrome\Application\chrome.exe") Then
    browserPath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
Else
    browserPath = "msedge.exe"
End If

' Launch as Standalone Desktop App (frameless window, silent printing)
WshShell.Run """" & browserPath & """ --app=http://localhost:4000" & page & " --kiosk-printing --window-size=1300,850", 1, False
