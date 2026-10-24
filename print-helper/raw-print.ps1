# print-helper/raw-print.ps1
#
# Sends a file's bytes RAW to a Windows printer (through the Windows print spooler),
# exactly as they are: the ESC/POS commands of a receipt go straight to the thermal
# printer — no driver page, no browser, nothing on screen.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File raw-print.ps1 -Printer "BTP-R180II(U) 1" -File job.bin
# Exit code 0 = printed; otherwise the error is written on stderr.

param(
  [Parameter(Mandatory = $true)][string]$Printer,
  [Parameter(Mandatory = $true)][string]$File
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO doc);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr handle, IntPtr bytes, int count, out int written);

  // "" = printed; otherwise the reason.
  public static string Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "Printer not found: " + printer;
    try {
      DOCINFO doc = new DOCINFO();
      doc.pDocName = "RES receipt";
      doc.pDataType = "RAW";
      if (StartDocPrinter(h, 1, doc) == 0) return "The printer refused the job (error " + Marshal.GetLastWin32Error() + ").";
      try {
        if (!StartPagePrinter(h)) return "The printer refused the page.";
        IntPtr buf = Marshal.AllocCoTaskMem(data.Length);
        try {
          Marshal.Copy(data, 0, buf, data.Length);
          int written;
          if (!WritePrinter(h, buf, data.Length, out written) || written != data.Length) return "Not all data reached the printer.";
        } finally {
          Marshal.FreeCoTaskMem(buf);
          EndPagePrinter(h);
        }
      } finally {
        EndDocPrinter(h);
      }
      return "";
    } finally {
      ClosePrinter(h);
    }
  }
}
"@

$bytes = [System.IO.File]::ReadAllBytes($File)
$err = [RawPrinter]::Send($Printer, $bytes)
if ($err) {
  [Console]::Error.WriteLine($err)
  exit 1
}
exit 0
