using System;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Printing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace Atelier {
 public static class NativePrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct DOCINFO { public int size; public string document; public string output; public string datatype; public uint flags; }
  [StructLayout(LayoutKind.Sequential)]
  struct SYSTEMTIME { public ushort year,month,dayOfWeek,day,hour,minute,second,milliseconds; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct JOB_INFO_1 {
   public uint id; public string printer,machine,user,document,datatype,statusText;
   public uint status,priority,position,totalPages,pagesPrinted; public SYSTEMTIME submitted;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct PRINTER_INFO_2 {
   public IntPtr server,printer,share,port,driver,comment,location,devMode,separator,processor,datatype,parameters,security;
   public uint attributes,priority,defaultPriority,start,until,status,jobs,average;
  }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool OpenPrinter(string name,out IntPtr printer,IntPtr defaults);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr printer);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool GetPrinter(IntPtr printer,uint level,IntPtr buffer,uint size,out uint needed);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool GetJob(IntPtr printer,uint id,uint level,IntPtr buffer,uint size,out uint needed);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool SetJob(IntPtr printer,uint id,uint level,IntPtr job,uint command);
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateDC(string driver,string device,string output,IntPtr devMode);
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern int StartDoc(IntPtr dc,ref DOCINFO info);
  [DllImport("gdi32.dll", SetLastError=true)] static extern int StartPage(IntPtr dc);
  [DllImport("gdi32.dll", SetLastError=true)] static extern int EndPage(IntPtr dc);
  [DllImport("gdi32.dll", SetLastError=true)] static extern int EndDoc(IntPtr dc);
  [DllImport("gdi32.dll")] static extern int AbortDoc(IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern int GetDeviceCaps(IntPtr dc,int index);
  [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr memory);
  [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr memory);
  [DllImport("kernel32.dll")] static extern IntPtr GlobalFree(IntPtr memory);
  static Exception Error(string message) { return new Win32Exception(Marshal.GetLastWin32Error(),message); }
  static PrinterSettings Settings(string name) {
   // Exact installed name, never a wildcard or the system default printer.
   bool found=false; foreach(string installed in PrinterSettings.InstalledPrinters) if(installed==name) found=true;
   if(!found) throw new ArgumentException("Select an exact installed printer name.");
   var settings=new PrinterSettings(); settings.PrinterName=name;
   if(!settings.IsValid) throw new ArgumentException("Printer is unavailable.");
   settings.Copies=1; settings.Collate=false; settings.PrintToFile=false;
   return settings;
  }
  static bool IsFourBySix(PaperSize paper) { return Math.Abs(paper.Width-400)<=1 && Math.Abs(paper.Height-600)<=1; }
  static bool IsLetter(PaperSize paper) { return paper.Width==850 && paper.Height==1100; }
  static bool IsEightByTwelve(PaperSize paper) { return Math.Abs(paper.Width-800)<=1 && Math.Abs(paper.Height-1200)<=1; }
  static bool KeepsJobs(string name) {
   IntPtr printer; if(!OpenPrinter(name,out printer,IntPtr.Zero)) throw Error("Cannot open printer.");
   try {
    uint needed; GetPrinter(printer,2,IntPtr.Zero,0,out needed); if(needed==0||needed>1048576) throw Error("Cannot read printer settings.");
    IntPtr buffer=Marshal.AllocHGlobal((int)needed);
    try { if(!GetPrinter(printer,2,buffer,needed,out needed)) throw Error("Cannot read printer settings."); return (((PRINTER_INFO_2)Marshal.PtrToStructure(buffer,typeof(PRINTER_INFO_2))).attributes & 0x100)!=0; }
    finally { Marshal.FreeHGlobal(buffer); }
   } finally { ClosePrinter(printer); }
  }
  public static string Printers() { var text=new StringBuilder(); foreach(string name in PrinterSettings.InstalledPrinters) text.AppendLine(name); return text.Length==0?"No printers installed.":text.ToString(); }
  public static string Media(string name) {
   var text=new StringBuilder(); var settings=Settings(name);
   text.AppendLine(KeepsJobs(name)?"Keep printed documents: enabled":"Enable Keep printed documents in Printer properties > Advanced before using this helper.");
   foreach(PaperSize paper in settings.PaperSizes) if(IsEightByTwelve(paper)||IsLetter(paper)||IsFourBySix(paper)) text.AppendLine(paper.RawKind+" : "+paper.PaperName+(IsFourBySix(paper)?" (4 x 6 inches)":IsLetter(paper)?" (Letter 8.5 x 11 test only)":" (8 x 12 inches)"));
   text.AppendLine("Use the numeric code above. If none is listed, install/configure the correct DNP driver and media.");return text.ToString();
  }
  public static object Diagnostics(string name) {
   IntPtr printer; if(!OpenPrinter(name,out printer,IntPtr.Zero)) throw Error("Cannot open printer.");
   try {uint needed;GetPrinter(printer,2,IntPtr.Zero,0,out needed);if(needed==0||needed>1048576)throw Error("Cannot read printer status.");IntPtr buffer=Marshal.AllocHGlobal((int)needed);
    try {if(!GetPrinter(printer,2,buffer,needed,out needed))throw Error("Cannot read printer status.");var p=(PRINTER_INFO_2)Marshal.PtrToStructure(buffer,typeof(PRINTER_INFO_2));return new {printer=name,port=Marshal.PtrToStringUni(p.port),driver=Marshal.PtrToStringUni(p.driver),status=p.status,jobs=p.jobs,attributes=p.attributes};}finally{Marshal.FreeHGlobal(buffer);}
   }finally{ClosePrinter(printer);}
  }
  public static void CancelWaitingTest(string name,uint id,string document) {
   var job=Status(name,id);if(job.document!=document||!System.Text.RegularExpressions.Regex.IsMatch(document??"","^Atelier-Win[a-f0-9]{32}$")||job.pagesPrinted!=0||(job.status&24)!=0)throw new InvalidOperationException("Only the identified waiting, unprinted test can be canceled.");
   IntPtr printer;if(!OpenPrinter(name,out printer,IntPtr.Zero))throw Error("Cannot open printer.");try{if(!SetJob(printer,id,0,IntPtr.Zero,5))throw Error("Cannot remove waiting test.");}finally{ClosePrinter(printer);}
  }
  public sealed class JobStatus { public uint jobId; public string document,statusText; public uint status,position,totalPages,pagesPrinted; }
  public static JobStatus Status(string name,uint id) {
   IntPtr printer; if(!OpenPrinter(name,out printer,IntPtr.Zero)) throw Error("Cannot open printer.");
   try {
    uint needed; GetJob(printer,id,1,IntPtr.Zero,0,out needed);
    if(needed==0||needed>1048576) throw new InvalidOperationException("Print job is missing or unavailable. Inspect the printer; disappearance is not proof of completion.");
    IntPtr buffer=Marshal.AllocHGlobal((int)needed);
    try { if(!GetJob(printer,id,1,buffer,needed,out needed)) throw Error("Cannot read this print job.");var j=(JOB_INFO_1)Marshal.PtrToStructure(buffer,typeof(JOB_INFO_1));return new JobStatus {jobId=j.id,document=j.document,status=j.status,statusText=j.statusText,position=j.position,totalPages=j.totalPages,pagesPrinted=j.pagesPrinted}; }
    finally { Marshal.FreeHGlobal(buffer); }
   } finally { ClosePrinter(printer); }
  }
  public static int Print(string name,int media,string title,string[] pages,bool letterTest=false,bool letter=false,bool photo=false) {
   if(!System.Text.RegularExpressions.Regex.IsMatch(title??"","^Atelier-Win[a-f0-9]{32}$")) throw new ArgumentException("Invalid print document identity.");
   if(pages==null||pages.Length<1||pages.Length>12) throw new ArgumentException("Invalid page count.");
   if(letterTest && pages.Length!=1) throw new ArgumentException("Letter test must be one sheet.");
   letter=letter||letterTest;
   int rasterWidth=photo?1200:letter?2550:2400,rasterHeight=photo?1800:letter?3300:3600; double paperWidth=photo?4:letter?8.5:8,paperHeight=photo?6:letter?11:12;
   var settings=Settings(name); PaperSize selected=null;
   foreach(PaperSize paper in settings.PaperSizes) if(paper.RawKind==media && (photo?IsFourBySix(paper):letter?IsLetter(paper):IsEightByTwelve(paper))) {if(selected!=null) throw new ArgumentException("Ambiguous driver media code.");selected=paper;}
   if(selected==null) throw new ArgumentException("Selected driver media does not match the chosen portrait paper size.");
   if(!letterTest&&!KeepsJobs(name)) throw new InvalidOperationException("Enable Keep printed documents in Printer properties > Advanced before printing.");
   settings.DefaultPageSettings.PaperSize=selected;settings.DefaultPageSettings.Landscape=false;settings.DefaultPageSettings.Margins=new Margins(0,0,0,0);
   var images=new Bitmap[pages.Length];IntPtr memory=IntPtr.Zero,locked=IntPtr.Zero,dc=IntPtr.Zero;bool started=false;
   try {
    // Validate every raster before any job is submitted.
    for(int i=0;i<pages.Length;i++) {
     byte[] bytes=Convert.FromBase64String(pages[i]);
     if(bytes.Length>22000000) throw new ArgumentException("Sheet is too large.");
     using(var stream=new MemoryStream(bytes)) using(var image=Image.FromStream(stream,true,true)) {
      if(image.Width!=rasterWidth||image.Height!=rasterHeight) throw new ArgumentException("Invalid sheet dimensions.");
      images[i]=new Bitmap(image);
     }
    }
    memory=settings.GetHdevmode(settings.DefaultPageSettings);locked=GlobalLock(memory);if(locked==IntPtr.Zero) throw Error("Cannot lock printer settings.");
    dc=CreateDC("WINSPOOL",name,null,locked);if(dc==IntPtr.Zero) throw Error("Cannot create printer context.");
    int dx=GetDeviceCaps(dc,88),dy=GetDeviceCaps(dc,90),width=GetDeviceCaps(dc,110),height=GetDeviceCaps(dc,111);
    if(dx<=0||dy<=0||Math.Abs((double)width/dx-paperWidth)>.04||Math.Abs((double)height/dy-paperHeight)>.04) throw new InvalidOperationException("Driver did not apply the selected paper size. Reconfigure and recalibrate.");
    var info=new DOCINFO {size=Marshal.SizeOf(typeof(DOCINFO)),document=title};int id=StartDoc(dc,ref info);if(id<=0) throw Error("Printer did not accept a verifiable job.");started=true;
    foreach(var image in images) {
     if(StartPage(dc)<=0) throw Error("Cannot start print page.");
     using(var graphics=Graphics.FromHdc(dc)) {
      graphics.PageUnit=GraphicsUnit.Pixel;graphics.PageScale=1;graphics.InterpolationMode=InterpolationMode.HighQualityBicubic;
      // Windows' drawing origin excludes hardware margins. Correct to physical paper origin.
      graphics.DrawImage(image,new Rectangle(-GetDeviceCaps(dc,112),-GetDeviceCaps(dc,113),(int)Math.Round(paperWidth*dx),(int)Math.Round(paperHeight*dy)),0,0,rasterWidth,rasterHeight,GraphicsUnit.Pixel);
     }
     if(EndPage(dc)<=0) throw Error("Cannot finish print page.");
    }
    if(EndDoc(dc)<=0) throw Error("Print submission outcome is uncertain.");started=false;return id;
   } finally {
    if(started&&dc!=IntPtr.Zero) AbortDoc(dc);
    if(dc!=IntPtr.Zero) DeleteDC(dc);if(locked!=IntPtr.Zero) GlobalUnlock(memory);if(memory!=IntPtr.Zero) GlobalFree(memory);
    foreach(var image in images) if(image!=null) image.Dispose();
   }
  }
 }
}
