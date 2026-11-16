using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace QuickPrint
{
    static class Program
    {
        private const string BaseUrl = "http://localhost:4000";

        [STAThread]
        static void Main(string[] args)
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            Environment.CurrentDirectory = appDir;

            // 1. Ensure the print server is running (it also serves the consoles).
            bool isServerRunning = false;
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(BaseUrl + "/api/info");
                req.Timeout = 1500;
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    if (resp.StatusCode == HttpStatusCode.OK) isServerRunning = true;
                }
            }
            catch { }

            if (!isServerRunning)
            {
                ProcessStartInfo serverPsi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c node server.js",
                    WorkingDirectory = appDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(serverPsi);
                WaitForServer();
            }

            // 2. Which console should open? Command line wins, then the installed role.
            string role = ParseRoleArg(args);
            if (role == null) role = ReadRoleFile(appDir);
            if (role == null) role = ReadRoleFromServer();

            string page = role == "admin" ? "/admin" : "/owner";

            // 3. Locate browser (Edge or Chrome)
            string browserPath = "";
            string edge = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            string edge64 = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
            string chrome = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
            string chrome86 = @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe";

            if (File.Exists(edge)) browserPath = edge;
            else if (File.Exists(edge64)) browserPath = edge64;
            else if (File.Exists(chrome)) browserPath = chrome;
            else if (File.Exists(chrome86)) browserPath = chrome86;
            else browserPath = "msedge.exe";

            // 4. Standalone app window; kiosk-printing keeps the print dialog silent.
            ProcessStartInfo appPsi = new ProcessStartInfo
            {
                FileName = browserPath,
                Arguments = "--app=" + BaseUrl + page + " --start-maximized --kiosk-printing",
                UseShellExecute = true
            };
            Process.Start(appPsi);
        }

        private static string ParseRoleArg(string[] args)
        {
            if (args == null) return null;
            foreach (string arg in args)
            {
                if (string.Equals(arg, "admin", StringComparison.OrdinalIgnoreCase)) return "admin";
                if (string.Equals(arg, "owner", StringComparison.OrdinalIgnoreCase)) return "owner";
                if (string.Equals(arg, "--admin", StringComparison.OrdinalIgnoreCase)) return "admin";
                if (string.Equals(arg, "--owner", StringComparison.OrdinalIgnoreCase)) return "owner";
            }
            return null;
        }

        private static string ReadRoleFile(string appDir)
        {
            try
            {
                string path = Path.Combine(appDir, "data", "role.txt");
                if (!File.Exists(path)) return null;
                string role = File.ReadAllText(path).Trim().ToLowerInvariant();
                if (role == "admin" || role == "owner") return role;
            }
            catch { }
            return null;
        }

        private static string ReadRoleFromServer()
        {
            for (int attempt = 0; attempt < 10; attempt++)
            {
                try
                {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(BaseUrl + "/api/role");
                    req.Timeout = 1500;
                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    using (StreamReader reader = new StreamReader(resp.GetResponseStream()))
                    {
                        string role = reader.ReadToEnd().Trim().ToLowerInvariant();
                        if (role == "admin" || role == "owner") return role;
                    }
                }
                catch { }
                Thread.Sleep(400);
            }
            return "owner";
        }

        private static void WaitForServer()
        {
            for (int attempt = 0; attempt < 20; attempt++)
            {
                Thread.Sleep(400);
                try
                {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(BaseUrl + "/api/info");
                    req.Timeout = 1000;
                    using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    {
                        if (resp.StatusCode == HttpStatusCode.OK) return;
                    }
                }
                catch { }
            }
        }
    }
}
