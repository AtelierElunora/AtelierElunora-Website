using System;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
namespace Atelier {
 public static class Bridge {
  public sealed class Request { public string action,printer,media,file,document,credential,profile;public uint jobId; }
  public sealed class Sheets { public string format;public int width,height;public string[] pages; }
  public static int Main() {
   try {
    Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
    var serializer=new JavaScriptSerializer();serializer.MaxJsonLength=268435456;
    string json=Console.In.ReadToEnd();if(json.Length>16384) throw new ArgumentException("Request is too large.");
    var request=serializer.Deserialize<Request>(json);object result;
    switch(request.action) {
     case "protect": result=new {credential=Convert.ToBase64String(System.Security.Cryptography.ProtectedData.Protect(Encoding.UTF8.GetBytes(request.credential),Encoding.UTF8.GetBytes("AtelierPrintHelper-v1"),System.Security.Cryptography.DataProtectionScope.CurrentUser))};break;
     case "unprotect": result=new {credential=Encoding.UTF8.GetString(System.Security.Cryptography.ProtectedData.Unprotect(Convert.FromBase64String(request.credential),Encoding.UTF8.GetBytes("AtelierPrintHelper-v1"),System.Security.Cryptography.DataProtectionScope.CurrentUser))};break;
     case "printers": result=new {text=NativePrinter.Printers()};break;
     case "diagnostics": result=NativePrinter.Diagnostics(request.printer);break;
     case "cancel-waiting-test": NativePrinter.CancelWaitingTest(request.printer,request.jobId,request.document);result=new {canceled=true};break;
     case "media": result=new {text=NativePrinter.Media(request.printer)};break;
     case "status": result=NativePrinter.Status(request.printer,request.jobId);break;
     case "letter-test":
     case "submit":
      var file=new FileInfo(request.file);if(file.Length>268435456) throw new ArgumentException("Prepared document is too large.");
      var sheets=serializer.Deserialize<Sheets>(File.ReadAllText(file.FullName));
      bool letterTest=request.action=="letter-test",letter=letterTest||request.profile=="letter-four",photo=request.profile=="photo-4x6-single";
      if(sheets.format!="atelier-windows-sheets-v1"||sheets.width!=(photo?1200:letter?2550:2400)||sheets.height!=(photo?1800:letter?3300:3600)) throw new ArgumentException("Invalid 8 x 12 document.");
      result=new {jobId=NativePrinter.Print(request.printer,int.Parse(request.media),request.document,sheets.pages,letterTest,letter,photo)};break;
     default: throw new ArgumentException("Unknown printer operation.");
    }
    Console.Write(serializer.Serialize(result));return 0;
   } catch(Exception e) { Console.Error.WriteLine(e.Message);return 1; }
  }
 }
}
