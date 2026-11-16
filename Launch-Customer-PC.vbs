Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath

' Load target URL from customer-config.txt if present, else fallback
Dim targetUrl
targetUrl = "http://localhost:4000/?kiosk=1"

Dim configFile
configFile = strPath & "\customer-config.txt"
If fso.FileExists(configFile) Then
    Dim ts
    Set ts = fso.OpenTextFile(configFile, 1)
    If Not ts.AtEndOfStream Then
        Dim line
        line = Trim(ts.ReadLine())
        If Len(line) > 5 Then
            If InStr(line, "kiosk=1") = 0 Then
                If InStr(line, "?") > 0 Then
                    targetUrl = line & "&kiosk=1"
                Else
                    targetUrl = line & "/?kiosk=1"
                End If
            Else
                targetUrl = line
            End If
        End If
    End If
    ts.Close
End If

' Check browser path
Dim browserPath
If fso.FileExists("C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe") Then
    browserPath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
ElseIf fso.FileExists("C:\Program Files\Google\Chrome\Application\chrome.exe") Then
    browserPath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
Else
    browserPath = "msedge.exe"
End If

' Launch in standalone window mode (No browser tabs or address bars)
WshShell.Run """" & browserPath & """ --app=" & targetUrl & " --window-size=1250,850", 1, False
