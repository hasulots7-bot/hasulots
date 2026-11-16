param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$word = $null
$doc = $null

try {
  if (-not (Test-Path -LiteralPath $InputPath)) { throw "Input file not found: $InputPath" }
  $outDir = Split-Path -Parent $OutputPath
  if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }

  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  # Disable macros from documents opened for conversion.
  try { $word.AutomationSecurity = 3 } catch { }

  # Open read-only, without showing repair/conversion dialogs.
  $doc = $word.Documents.Open($InputPath, $false, $true, $false)

  # wdFormatPDF = 17
  $doc.ExportAsFixedFormat($OutputPath, 17, $false)

  if (-not (Test-Path -LiteralPath $OutputPath)) {
    throw 'Word did not produce the PDF output'
  }
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
finally {
  if ($doc -ne $null) {
    try { $doc.Close(0) } catch { }
  }
  if ($word -ne $null) {
    try { $word.Quit() } catch { }
    try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null } catch { }
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
