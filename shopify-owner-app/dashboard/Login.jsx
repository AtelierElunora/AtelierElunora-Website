import {h,Fragment} from 'preact';
import {useEffect,useRef,useState} from 'preact/hooks';
let turnstileLoading;
export function Login({call,onSession,run,busy}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[mode,setMode]=useState('password'),[code,setCode]=useState(''),[sent,setSent]=useState(false),[token,setToken]=useState(''),[error,setError]=useState('');
 const captcha=useRef(),widget=useRef();
 const reset=()=>{setToken('');if(widget.current!==undefined)window.turnstile?.reset(widget.current);};
 useEffect(()=>{let alive=true;
  if(!window.turnstile)turnstileLoading??=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=resolve;script.onerror=()=>{turnstileLoading=null;reject(Error('Security check could not load. Refresh to retry.'));};document.head.append(script);});
  Promise.resolve(turnstileLoading).then(()=>{if(alive)widget.current=window.turnstile.render(captcha.current,{sitekey:'0x4AAAAAAE7tigopK_0bbZOB',action:'gallery_login',theme:'light',size:'flexible',callback:value=>{setToken(value);setError('');},'expired-callback':()=>setToken(''),'error-callback':()=>{setToken('');setError('Security check could not complete. Refresh the page and try again.');}});}).catch(e=>{if(alive)setError(e.message);});
  return()=>{alive=false;if(widget.current!==undefined)window.turnstile?.remove(widget.current);};
 },[]);
 const changeMode=next=>{setMode(next);setSent(false);setCode('');setPassword('');setError('');reset();};
 async function submit(){
  setError('');
  try{
   if(sent){await onSession(await call('verify',{email:email.trim(),token:code},null),mode==='setup');return;}
   try{
    if(mode==='password'){
     const s=await call('password-login',{email:email.trim(),password,captchaToken:token},null);setPassword('');await onSession(s,false);
    }else{await call('login',{email:email.trim(),captchaToken:token},null);setSent(true);}
   }finally{reset();}
  }catch(err){setError('Sign-in request failed: '+err.message);}
 }
 return <div class="login"><div class="login-story"><img class="studio-main-logo" src="https://cdn.shopify.com/s/files/1/1017/1069/2640/files/atelier-elunora-main-logo-web.png?v=1790015151" alt="Atelier Elunora" width="1600" height="1129"/><p class="eyebrow">ATELIER ELUNORA</p><h1>A beautiful place<br/>to run your studio.</h1><p>Your events, your photographs,<br/>every detail in one place.</p></div><section class="login-card"><p class="eyebrow">OWNER STUDIO</p><h2>{mode==='setup'?'Create or reset password':'Welcome back.'}</h2><p>{mode==='setup'?'Verify your email and authenticator, then choose a password.':'Sign in with your owner email, then verify your authenticator.'}</p>
  <form onSubmit={e=>{e.preventDefault();run(submit);}}>
   <label class="field">Owner email<input type="email" required value={email} disabled={busy} readOnly={sent} onInput={e=>setEmail(e.currentTarget.value)} autoComplete="username"/></label>
   {mode==='password'&&<label class="field">Password<input type="password" required maxLength={128} value={password} disabled={busy} autoComplete="current-password" onInput={e=>setPassword(e.currentTarget.value)}/></label>}
   <div ref={captcha} hidden={sent}/>{error&&<p role="alert">{error}</p>}
   {sent&&<><p role="status">Check your email for an eight-digit code.</p><label class="field">Eight-digit email code<input value={code} inputMode="numeric" pattern="[0-9]{8}" maxLength={8} autoComplete="one-time-code" required disabled={busy} onInput={e=>setCode(e.currentTarget.value)}/></label></>}
   <button class="primary" disabled={busy||(!sent&&!token)}>{sent?'Continue securely':mode==='password'?'Sign in':'Send sign-in code'}</button>
   {sent&&<button type="button" disabled={busy} onClick={()=>{setSent(false);setCode('');reset();}}>Request another code or change email</button>}
  </form>
  <div class="row">{mode!=='password'&&<button type="button" disabled={busy} onClick={()=>changeMode('password')}>Use password</button>}{mode!=='code'&&<button type="button" disabled={busy} onClick={()=>changeMode('code')}>Use an email code</button>}{mode!=='setup'&&<button type="button" disabled={busy} onClick={()=>changeMode('setup')}>Create or reset password</button>}</div>
  <p class="muted">Your owner session stays in this tab.</p>
 </section></div>;
}
export function PasswordSetup({onSave,onCancel,run,busy}){
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 return <section class="login-card"><h2>Choose your password</h2><p>Use 12–128 characters. A unique passphrase works well.</p><form onSubmit={e=>{e.preventDefault();run(async()=>{if(password!==confirm)throw Error('Passwords do not match.');await onSave(password);setPassword('');setConfirm('');});}}>
  <label class="field">New password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} disabled={busy} onInput={e=>setPassword(e.currentTarget.value)}/></label>
  <label class="field">Confirm password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} disabled={busy} onInput={e=>setConfirm(e.currentTarget.value)}/></label>
  <button class="primary" disabled={busy}>Save password and continue</button><button type="button" disabled={busy} onClick={onCancel}>Cancel and sign out</button>
 </form></section>;
}
