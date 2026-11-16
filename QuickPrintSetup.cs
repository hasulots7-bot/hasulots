using System;
using System.Drawing;
using System.IO;
using System.Text;
using System.Globalization;
using System.Windows.Forms;
using System.Diagnostics;

namespace QuickPrintSetup
{
    public class SetupForm : Form
    {
        // ----- role -----
        private RadioButton rbOwner;
        private RadioButton rbAdmin;

        // ----- shop details (owner) -----
        private GroupBox shopPanel;
        private TextBox txtShopName;
        private TextBox txtUsername;
        private TextBox txtPassword;
        private TextBox txtPhone;
        private TextBox txtAddress;
        private TextBox txtUpi;
        private TextBox txtBwRate;
        private TextBox txtColorRate;

        private bool usernameEdited = false;
        private bool upiEdited = false;
        private string lastAutoUsername = "";
        private string lastAutoUpi = "";

        // ----- platform admin -----
        private TextBox txtPlatformUser;
        private TextBox txtPlatformPass;

        // ----- what to install -----
        private CheckBox chkDesktop;
        private CheckBox chkStartMenu;
        private CheckBox chkAutoStart;

        // ----- status -----
        private Label lblStatus;
        private Button btnInstall;
        private Button btnCancel;

        public SetupForm()
        {
            this.Text = "QuickPrint Setup";
            this.Size = new Size(560, 700);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = Color.White;
            this.AutoScaleMode = AutoScaleMode.Dpi;

            string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"public\icon.ico");
            if (File.Exists(iconPath))
            {
                try { this.Icon = new Icon(iconPath); } catch { }
            }

            int pad = 22;
            int y = 16;

            Label title = new Label
            {
                Text = "QuickPrint Setup",
                Font = new Font("Segoe UI", 16, FontStyle.Bold),
                Location = new Point(pad, y),
                AutoSize = true,
                ForeColor = Color.FromArgb(15, 23, 42)
            };
            this.Controls.Add(title);
            y += 34;

            Label subtitle = new Label
            {
                Text = "Choose what this PC should do. Customers never install anything — they only scan the QR.",
                Font = new Font("Segoe UI", 9),
                Location = new Point(pad + 1, y),
                Size = new Size(500, 32),
                ForeColor = Color.FromArgb(100, 116, 139)
            };
            this.Controls.Add(subtitle);
            y += 40;

            // ===== ROLE =====
            GroupBox roleBox = new GroupBox
            {
                Text = "1. What is this PC?",
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Location = new Point(pad, y),
                Size = new Size(500, 86),
                ForeColor = Color.FromArgb(51, 65, 85)
            };
            this.Controls.Add(roleBox);

            rbOwner = new RadioButton
            {
                Text = "Shop Owner PC  —  prints documents, manages orders and customers",
                Font = new Font("Segoe UI", 9, FontStyle.Regular),
                Location = new Point(14, 24),
                Size = new Size(470, 24),
                Checked = true
            };
            rbOwner.CheckedChanged += (s, e) => UpdateRoleUi();
            roleBox.Controls.Add(rbOwner);

            rbAdmin = new RadioButton
            {
                Text = "Platform Admin PC  —  manages shops, tunnel and platform settings",
                Font = new Font("Segoe UI", 9, FontStyle.Regular),
                Location = new Point(14, 52),
                Size = new Size(470, 24)
            };
            rbAdmin.CheckedChanged += (s, e) => UpdateRoleUi();
            roleBox.Controls.Add(rbAdmin);
            y += 96;

            // ===== SHOP DETAILS =====
            shopPanel = new GroupBox
            {
                Text = "2. Shop details (used by the owner console and customer QR page)",
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Location = new Point(pad, y),
                Size = new Size(500, 268),
                ForeColor = Color.FromArgb(51, 65, 85)
            };
            this.Controls.Add(shopPanel);

            int sx = 14;
            int sy = 24;
            AddField(shopPanel, "Shop name *", sx, sy, 300, out txtShopName);
            AddField(shopPanel, "Owner username *", sx + 308, sy, 156, out txtUsername);
            txtShopName.TextChanged += (s, e) => AutoFillFromShopName();
            txtUsername.TextChanged += (s, e) => { if (txtUsername.Text != lastAutoUsername) usernameEdited = true; };
            sy += 52;
            AddField(shopPanel, "Owner password *", sx, sy, 140, out txtPassword);
            AddField(shopPanel, "Phone", sx + 148, sy, 140, out txtPhone);
            AddField(shopPanel, "B&W rate (₹/page)", sx + 296, sy, 168, out txtBwRate);
            sy += 52;
            AddField(shopPanel, "UPI ID (GPay / PhonePe)", sx, sy, 220, out txtUpi);
            AddField(shopPanel, "Color rate (₹/page)", sx + 228, sy, 236, out txtColorRate);
            txtUpi.TextChanged += (s, e) => { if (txtUpi.Text != lastAutoUpi) upiEdited = true; };
            sy += 52;
            AddField(shopPanel, "Shop address (optional)", sx, sy, 464, out txtAddress);

            txtPassword.Text = "1234";
            txtBwRate.Text = "3";
            txtColorRate.Text = "10";
            y += 278;

            // ===== PLATFORM ADMIN =====
            GroupBox adminBox = new GroupBox
            {
                Text = "3. Platform admin login (for /admin on any PC)",
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Location = new Point(pad, y),
                Size = new Size(500, 80),
                ForeColor = Color.FromArgb(51, 65, 85)
            };
            this.Controls.Add(adminBox);

            AddField(adminBox, "Admin username", sx, 24, 200, out txtPlatformUser);
            AddField(adminBox, "Admin password", sx + 208, 24, 256, out txtPlatformPass);
            txtPlatformUser.Text = "admin";
            txtPlatformPass.Text = "1234";
            y += 90;

            // ===== COMPONENTS =====
            GroupBox compBox = new GroupBox
            {
                Text = "4. What to install on this PC",
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                Location = new Point(pad, y),
                Size = new Size(500, 104),
                ForeColor = Color.FromArgb(51, 65, 85)
            };
            this.Controls.Add(compBox);

            chkDesktop = new CheckBox
            {
                Text = "Desktop shortcut",
                Location = new Point(14, 24),
                Size = new Size(220, 22),
                Checked = true,
                Font = new Font("Segoe UI", 9)
            };
            compBox.Controls.Add(chkDesktop);

            chkStartMenu = new CheckBox
            {
                Text = "Start Menu shortcut",
                Location = new Point(250, 24),
                Size = new Size(230, 22),
                Checked = true,
                Font = new Font("Segoe UI", 9)
            };
            compBox.Controls.Add(chkStartMenu);

            chkAutoStart = new CheckBox
            {
                Text = "Start QuickPrint automatically when Windows signs in",
                Location = new Point(14, 52),
                Size = new Size(460, 22),
                Checked = true,
                Font = new Font("Segoe UI", 9)
            };
            compBox.Controls.Add(chkAutoStart);

            Label compNote = new Label
            {
                Text = "Word / PDF preview and the customer QR page are always included. No extra install is needed on customer phones.",
                Location = new Point(14, 76),
                Size = new Size(470, 22),
                Font = new Font("Segoe UI", 7.8f),
                ForeColor = Color.FromArgb(100, 116, 139)
            };
            compBox.Controls.Add(compNote);
            y += 114;

            // ===== STATUS + BUTTONS =====
            lblStatus = new Label
            {
                Text = "Review the choices, then click Install.",
                Font = new Font("Segoe UI", 8.8f),
                Location = new Point(pad + 1, y),
                Size = new Size(500, 34),
                ForeColor = Color.FromArgb(100, 116, 139)
            };
            this.Controls.Add(lblStatus);
            y += 38;

            btnInstall = new Button
            {
                Text = "Install",
                Location = new Point(pad + 274, y),
                Size = new Size(110, 36),
                Font = new Font("Segoe UI", 9, FontStyle.Bold),
                BackColor = Color.FromArgb(79, 70, 229),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Click += (s, e) => RunInstall();
            this.Controls.Add(btnInstall);

            btnCancel = new Button
            {
                Text = "Cancel",
                Location = new Point(pad + 390, y),
                Size = new Size(110, 36),
                Font = new Font("Segoe UI", 9),
                FlatStyle = FlatStyle.Flat
            };
            btnCancel.Click += (s, e) => this.Close();
            this.Controls.Add(btnCancel);

            UpdateRoleUi();
        }

        private static Label MakeLabel(string text, int x, int y, int w)
        {
            return new Label
            {
                Text = text,
                Location = new Point(x, y),
                Size = new Size(w, 18),
                Font = new Font("Segoe UI", 8, FontStyle.Bold),
                ForeColor = Color.FromArgb(71, 85, 105)
            };
        }

        private static void AddField(Control parent, string label, int x, int y, int width, out TextBox box)
        {
            parent.Controls.Add(MakeLabel(label, x, y, width));
            box = new TextBox
            {
                Location = new Point(x, y + 19),
                Size = new Size(width, 24),
                Font = new Font("Segoe UI", 9)
            };
            parent.Controls.Add(box);
        }

        private void AutoFillFromShopName()
        {
            string clean = (txtShopName.Text ?? "").Trim();
            StringBuilder sb = new StringBuilder();
            foreach (char ch in clean)
            {
                if (char.IsLetterOrDigit(ch)) sb.Append(ch);
            }
            clean = sb.ToString();
            if (clean.Length == 0) return;
            if (clean.Length > 10) clean = clean.Substring(0, 10);

            if (!usernameEdited)
            {
                lastAutoUsername = clean.ToLowerInvariant();
                txtUsername.Text = lastAutoUsername;
            }
            if (!upiEdited)
            {
                lastAutoUpi = clean.ToLowerInvariant() + "@upi";
                txtUpi.Text = lastAutoUpi;
            }
        }

        private void UpdateRoleUi()
        {
            bool owner = rbOwner.Checked;
            shopPanel.Enabled = owner;
            foreach (Control c in shopPanel.Controls)
            {
                c.ForeColor = owner ? Color.FromArgb(30, 41, 59) : Color.FromArgb(148, 163, 184);
            }
            chkAutoStart.Text = owner
                ? "Start QuickPrint automatically when Windows signs in"
                : "Start QuickPrint admin console automatically when Windows signs in";
            lblStatus.Text = owner
                ? "This PC will print customer documents and run the Shop Owner console."
                : "This PC will manage shops and the public tunnel. Printing happens on owner PCs.";
        }

        // ===== install =================================================
        private void RunInstall()
        {
            string role = rbAdmin.Checked ? "admin" : "owner";
            bool owner = role == "owner";

            if (owner && txtShopName.Text.Trim().Length == 0)
            {
                MessageBox.Show(this, "Enter the shop name, or choose Platform Admin PC.", "Shop name required",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtShopName.Focus();
                return;
            }
            if (owner && txtUsername.Text.Trim().Length == 0)
            {
                MessageBox.Show(this, "Enter the shop owner username.", "Username required",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtUsername.Focus();
                return;
            }
            if (txtPlatformUser.Text.Trim().Length == 0 || txtPlatformPass.Text.Trim().Length == 0)
            {
                MessageBox.Show(this, "Enter the platform admin username and password.", "Admin login required",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                txtPlatformUser.Focus();
                return;
            }

            btnInstall.Enabled = false;
            btnInstall.Text = "Installing…";
            lblStatus.ForeColor = Color.FromArgb(100, 116, 139);
            lblStatus.Text = "Writing configuration for the QuickPrint server…";
            Application.DoEvents();

            try
            {
                WriteFirstRunConfig(role);
                lblStatus.Text = "Creating shortcuts and startup entry…";
                Application.DoEvents();
                CreateShortcuts(role);

                lblStatus.ForeColor = Color.FromArgb(16, 185, 129);
                lblStatus.Text = owner
                    ? "Done. Desktop shortcut opens the Shop Owner console and starts the server."
                    : "Done. Desktop shortcut opens the Platform Admin console and starts the server.";

                DialogResult dr = MessageBox.Show(this,
                    "Setup complete.\n\nLaunch QuickPrint now?",
                    "QuickPrint Setup", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
                this.Close();
                if (dr == DialogResult.Yes) LaunchApp();
            }
            catch (Exception ex)
            {
                lblStatus.ForeColor = Color.FromArgb(185, 28, 28);
                lblStatus.Text = "Setup failed: " + ex.Message;
                MessageBox.Show(this, ex.Message, "Setup failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
                btnInstall.Enabled = true;
                btnInstall.Text = "Retry install";
            }
        }

        private void WriteFirstRunConfig(string role)
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string dataDir = Path.Combine(appDir, "data");
            Directory.CreateDirectory(dataDir);

            bool owner = role == "owner";
            string shopName = owner ? txtShopName.Text.Trim() : "";
            string namePart = "";
            foreach (char ch in shopName)
            {
                if (char.IsLetterOrDigit(ch)) namePart += char.ToUpperInvariant(ch);
            }
            if (namePart.Length > 10) namePart = namePart.Substring(0, 10);
            if (namePart.Length == 0) namePart = "SHOP";

            string shopId = owner
                ? "QP_" + namePart + "_" + new Random().Next(100, 999).ToString(CultureInfo.InvariantCulture)
                : "";

            StringBuilder json = new StringBuilder();
            json.Append("{\n");
            json.Append("  \"role\": ").Append(Quote(role)).Append(",\n");
            json.Append("  \"installedAt\": ").Append(Quote(DateTime.UtcNow.ToString("o"))).Append(",\n");
            json.Append("  \"shopId\": ").Append(Quote(shopId)).Append(",\n");
            json.Append("  \"shopName\": ").Append(Quote(shopName)).Append(",\n");
            json.Append("  \"username\": ").Append(Quote(txtUsername.Text.Trim())).Append(",\n");
            json.Append("  \"password\": ").Append(Quote(txtPassword.Text.Trim())).Append(",\n");
            json.Append("  \"phone\": ").Append(Quote(txtPhone.Text.Trim())).Append(",\n");
            json.Append("  \"address\": ").Append(Quote(txtAddress.Text.Trim())).Append(",\n");
            json.Append("  \"upiId\": ").Append(Quote(txtUpi.Text.Trim())).Append(",\n");
            json.Append("  \"bwRate\": ").Append(JsonNumber(txtBwRate.Text, "3")).Append(",\n");
            json.Append("  \"colorRate\": ").Append(JsonNumber(txtColorRate.Text, "10")).Append(",\n");
            json.Append("  \"platformUsername\": ").Append(Quote(txtPlatformUser.Text.Trim())).Append(",\n");
            json.Append("  \"platformPassword\": ").Append(Quote(txtPlatformPass.Text.Trim())).Append(",\n");
            json.Append("  \"components\": {\n");
            json.Append("    \"desktopShortcut\": ").Append(chkDesktop.Checked ? "true" : "false").Append(",\n");
            json.Append("    \"startMenuShortcut\": ").Append(chkStartMenu.Checked ? "true" : "false").Append(",\n");
            json.Append("    \"autoStart\": ").Append(chkAutoStart.Checked ? "true" : "false").Append("\n");
            json.Append("  }\n");
            json.Append("}\n");

            // The server applies and archives this file on its next start.
            File.WriteAllText(Path.Combine(dataDir, "first-run.json"), json.ToString(), new UTF8Encoding(false));
            File.WriteAllText(Path.Combine(dataDir, "role.txt"), role == "admin" ? "admin" : "owner", new UTF8Encoding(false));
        }

        private void CreateShortcuts(string role)
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string targetExe = Path.Combine(appDir, "QuickPrint.exe");
            string iconPath = Path.Combine(appDir, @"public\icon.ico");
            bool owner = role == "owner";
            string name = owner ? "QuickPrint Shop Owner" : "QuickPrint Admin";
            string description = owner
                ? "QuickPrint - Shop Owner console and print server"
                : "QuickPrint - Platform Admin console";

            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) throw new Exception("Windows Script Host is not available on this PC.");
            dynamic shell = Activator.CreateInstance(shellType);

            if (chkDesktop.Checked)
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                CreateLnk(shell, Path.Combine(desktop, name + ".lnk"), targetExe, appDir, description, iconPath);
            }

            if (chkStartMenu.Checked)
            {
                string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                CreateLnk(shell, Path.Combine(startMenu, name + ".lnk"), targetExe, appDir, description, iconPath);
            }

            // Remove the shortcut for the other role so this PC is not confusing.
            string otherName = owner ? "QuickPrint Admin" : "QuickPrint Shop Owner";
            TryDelete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), otherName + ".lnk"));
            TryDelete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), otherName + ".lnk"));
            TryDelete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "QuickPrint Print Agent.lnk"));

            string startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
            string startupLnk = Path.Combine(startup, name + ".lnk");
            if (chkAutoStart.Checked)
            {
                CreateLnk(shell, startupLnk, targetExe, appDir, description + " (auto start)", iconPath);
            }
            else
            {
                TryDelete(startupLnk);
            }
        }

        private static void CreateLnk(dynamic shell, string path, string target, string workdir, string description, string icon)
        {
            dynamic sc = shell.CreateShortcut(path);
            sc.TargetPath = target;
            sc.WorkingDirectory = workdir;
            sc.Description = description;
            if (File.Exists(icon)) sc.IconLocation = icon;
            sc.Save();
        }

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch { }
        }

        private static void LaunchApp()
        {
            string exePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "QuickPrint.exe");
            if (File.Exists(exePath)) Process.Start(exePath);
        }

        private static string Quote(string value)
        {
            if (value == null) value = "";
            StringBuilder sb = new StringBuilder("\"");
            foreach (char c in value)
            {
                switch (c)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '"': sb.Append("\\\""); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 32) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append("\"");
            return sb.ToString();
        }

        private static string JsonNumber(string raw, string fallback)
        {
            double parsed;
            if (double.TryParse((raw ?? "").Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out parsed) && parsed > 0)
            {
                return parsed.ToString("0.##", CultureInfo.InvariantCulture);
            }
            return fallback;
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }
    }
}
