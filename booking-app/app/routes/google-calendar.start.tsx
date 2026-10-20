import type {LoaderFunctionArgs} from 'react-router';
import {redirect} from 'react-router';
import {startGoogleConnect} from '../google-calendar.server';
export async function loader({request}:LoaderFunctionArgs){try{const url=new URL(request.url),result=await startGoogleConnect(url.searchParams.get('shop')||'',url.searchParams.get('ticket')||'');return redirect(result.url,{headers:{'Set-Cookie':'elunora_google_state='+encodeURIComponent(result.state)+'; HttpOnly; Secure; SameSite=Lax; Path=/google-calendar; Max-Age=600','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}catch{return new Response('Connection link unavailable or expired. Return to the booking app and connect again.',{status:400});}}
