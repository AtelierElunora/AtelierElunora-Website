import {useAppBridge} from "@shopify/app-bridge-react";
import {useState} from "react";
export function CalendarDownload({bookingId}:{bookingId:string}){
  const bridge=useAppBridge(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function download(){
    setBusy(true);setError("");
    try {
      const response=await fetch("/calendar/"+bookingId,{headers:{Authorization:"Bearer "+await bridge.idToken()}});
      if(!response.ok||!response.headers.get("Content-Type")?.startsWith("text/calendar"))throw Error("Calendar download failed. Reopen the app and try again.");
      const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");
      link.href=url;link.download="elunora-wedding.ics";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch {setError("Calendar download failed. Reopen the app and try again.");}
    finally {setBusy(false);}
  }
  return <><button type="button" disabled={busy} onClick={download}>Export calendar event</button>{error&&<p role="alert">{error}</p>}</>;
}
