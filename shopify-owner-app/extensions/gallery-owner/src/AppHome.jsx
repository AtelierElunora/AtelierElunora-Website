import {RemoveGuestAccess,OwnerPhoto,UploadPanel,PermanentDelete,RequestCard,OwnerMfa} from './shared-owner.jsx';
import {PhotoStation} from './PhotoStation.jsx';
import {GuestExperience} from './GuestExperience.jsx';
/** @jsxRuntime classic */
/** @jsx h */
import '@shopify/ui-extensions/preact';
import {render, h} from 'preact';
import {useState, useEffect, useRef} from 'preact/hooks';
import {STATUSES, linkedPayments, paymentReview, formatBytes, accessState} from './workflows.mjs';

import {addFiles, runUploadQueue} from './upload-queue.mjs';

const API = 'https://gefdlubvqymyxrguhtnc.supabase.co/functions/v1/gallery-api/';
export default async () => { render(<OwnerGallery/>, document.body); };
const errorText = e => e instanceof Error ? e.message : 'Please retry.';

export function OwnerGallery() {
  const [session, setSession] = useState(null), [email, setEmail] = useState(''), [code, setCode] = useState('');
  const [data, setData] = useState(null), [event, setEvent] = useState(null), [detail, setDetail] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [mfaGate, setMfaGate] = useState(false), [backupMfa, setBackupMfa] = useState(false);
  const [deleteName, setDeleteName] = useState('');
  const [photoPage, setPhotoPage] = useState(0);
  const [screen, setScreen] = useState('events'), [query, setQuery] = useState('');
  const [name, setName] = useState(''), [date, setDate] = useState(''), [guest, setGuest] = useState(''), [expires, setExpires] = useState('');
  const lock = useRef(false), generation = useRef(0), liveSession = useRef(null), refreshing = useRef(null);
  function clearAccount() {
    setMfaGate(false); setBackupMfa(false); setDeleteName(''); generation.current++; liveSession.current = null; refreshing.current = null; setSession(null); setData(null); setEvent(null); setDetail(null);
    setCode(''); setGuest(''); setExpires(''); setName(''); setDate(''); setQuery(''); setScreen('events');
  }
  async function call(path, body = undefined, current = liveSession.current) {
    const stamp = generation.current;
    if (current && current === liveSession.current && path !== 'refresh' && current.expires_at && current.expires_at * 1000 < Date.now() + 120000) {
      if (!refreshing.current) refreshing.current = call('refresh', {refresh_token: current.refresh_token}, current)
        .then(next => { if (stamp !== generation.current) throw Error('Owner session changed.'); liveSession.current = next; setSession(next); return next; })
        .finally(() => { refreshing.current = null; });
      current = await refreshing.current;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    let response;
    try { response = await fetch(API + path, {method: body ? 'POST' : 'GET', headers: {'X-Elunora-Request': '1', ...(current ? {Authorization: 'Bearer ' + current.access_token} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined, signal: controller.signal}); } finally { clearTimeout(timeout); }
    const result = await response.json().catch(() => ({error: 'The gallery service returned an unexpected response. Please retry.'}));
    if (stamp !== generation.current) throw Error('Owner session changed. Please sign in again.');
    if (!response.ok) {
      if (response.status === 401 && current) clearAccount();
      if (response.status === 403 && result.code === 'MFA_REQUIRED') { setData(null); setEvent(null); setDetail(null); setBackupMfa(false); setMfaGate(true); }
      throw Object.assign(new Error(result.error || 'Please retry.'), {status: response.status});
    }
    return result;
  }
  async function run(fn) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await fn(); } catch (e) { setMessage(errorText(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function refresh(current = liveSession.current) { setData(await call('owner', undefined, current)); }
  async function open(id) {
    setDeleteName(''); const d = await call('owner/events/' + id); setEvent(d.event); setDetail(d); setPhotoPage(0); setGuest(''); setExpires('');
  }
  async function reloadEvent() { await open(event.id); await refresh(); }
  async function signIn() {
    if (!/^[0-9]{8}$/.test(code)) throw Error('Enter the eight-digit email code.');
    const s = await call('verify', {email: email.trim(), token: code}, null);
    const identity = await call('session', undefined, s);
    if (!identity.owner) { await call('logout', {refresh_token: s.refresh_token}, s); throw Error('This account is not a gallery owner.'); }
    liveSession.current = s; setSession(s); setMfaGate(true); setCode(''); setMessage('');
  }
  async function completeMfa(next) {
    if (next) { liveSession.current = next; setSession(next); }
    const status = await call('mfa/status');
    if (status.aal !== 'aal2') throw Error('Verify your authenticator before opening owner galleries.');
    await call('mfa/activate', {});
    await refresh(); setBackupMfa(false); setMfaGate(false); setMessage('');
  }
  async function logout() { try { await call('logout', {refresh_token: session.refresh_token}); } finally { clearAccount(); } }
  function navigate(next) { return run(async () => { await refresh(); setEvent(null); setDetail(null); setScreen(next); }); }
  const matches = data?.events.filter(e => !e.deleted_at && e.name.toLowerCase().includes(query.toLowerCase())) || [];
  return <s-page heading="Atelier Elunora galleries">
    {message && <s-banner tone="warning">{message}</s-banner>}
    {!session ? <s-section heading="Connect your owner account">
      <s-paragraph>Verify the owner email associated with your private galleries. This connection does not grant access to other Shopify staff.</s-paragraph>
      <s-email-field label="Owner email" value={email} onInput={e => {setEmail(e.currentTarget.value); setCode(''); setMessage('');}} disabled={busy}/>
      <s-paragraph>Open the secure code-request page below, enter the same owner email, and complete the security check. Return here with the emailed code. Your authenticator check follows in this app.</s-paragraph>
      <s-link href="https://www.atelierelunora.com/pages/client-gallery#owner-sign-in" target="_blank">Request a sign-in code securely</s-link>
      <s-stack gap="base"><s-text-field label="Eight-digit code" value={code} maxLength={8} onInput={e => setCode(e.currentTarget.value)} disabled={busy}/><s-button variant="primary" disabled={busy || !email.trim() || !/^[0-9]{8}$/.test(code)} onClick={() => run(signIn)}>Open owner galleries</s-button></s-stack>
    </s-section> : mfaGate || backupMfa ? <OwnerMfa call={call} onVerified={completeMfa} alreadyVerified={backupMfa} onCancel={backupMfa ? () => setBackupMfa(false) : () => run(logout)}/> : <s-stack gap="base">
      <s-stack direction="inline" gap="base">
        <s-button disabled={busy} onClick={() => navigate('events')}>All galleries</s-button>
        <s-button disabled={busy} onClick={() => navigate('orders')}>Orders and selections</s-button>
        <s-button disabled={busy} onClick={() => navigate('storage')}>Storage</s-button>
        <s-button disabled={busy} onClick={() => navigate('trash')}>Trash</s-button>
        <s-button disabled={busy} onClick={() => setBackupMfa(true)}>Add backup authenticator</s-button>
        <s-button disabled={busy} onClick={() => run(logout)}>Disconnect owner account</s-button>
      </s-stack>
      {!event && data && screen === 'events' && <s-stack gap="base">
        <s-section heading="All event galleries">
          <s-search-field label="Find an event" value={query} onInput={e => setQuery(e.currentTarget.value)}/>
          {!matches.length && <s-paragraph>{data.events.length ? 'No events match your search.' : 'Create your first private event below.'}</s-paragraph>}
          <s-table><s-table-header-row><s-table-header listSlot="primary">Event</s-table-header><s-table-header>Date</s-table-header><s-table-header>Guest access</s-table-header><s-table-header>Manage</s-table-header></s-table-header-row>
            <s-table-body>{matches.map(e => <s-table-row key={e.id}><s-table-cell>{e.name}{e.is_sample ? ' (sample)' : ''}</s-table-cell><s-table-cell>{e.event_date}</s-table-cell><s-table-cell>{e.active ? 'Active' : 'Paused'}</s-table-cell><s-table-cell><s-button disabled={busy} onClick={() => run(() => open(e.id))}>Open gallery</s-button></s-table-cell></s-table-row>)}</s-table-body>
          </s-table>
        </s-section>
        <s-section heading="Create an event">
          <s-text-field label="Event name" value={name} maxLength={120} disabled={busy} onInput={e => setName(e.currentTarget.value)}/>
          <s-date-field label="Event date" value={date} disabled={busy} onInput={e => setDate(e.currentTarget.value)}/>
          <s-button disabled={busy || !name.trim() || !date} onClick={() => run(async () => {const d = await call('owner/events', {name, date}); setName(''); setDate(''); await refresh(); await open(d.event.id); setMessage('Private event created. Add photos and guest access before enabling it.');})}>Create private event</s-button>
        </s-section>
      </s-stack>}
      {!event && data && screen === 'trash' && <s-section heading="Deleted galleries">
        <s-paragraph>Guests cannot access galleries in Trash. Photos and order records are retained and still use storage. Restoring a gallery keeps guest access paused.</s-paragraph>
        {!data.events.some(e => e.deleted_at) && <s-paragraph>Trash is empty.</s-paragraph>}
        {data.events.filter(e => e.deleted_at).map(e => <s-box key={e.id} padding="base" border="base">
          <s-paragraph>{e.name} | {e.event_date}</s-paragraph>
          <s-button disabled={busy || !!e.purge_started_at} onClick={() => run(async () => {await call('owner/events/' + e.id, {action: 'restore'}); await refresh(); setMessage('Gallery restored with guest access paused.');})}>Restore gallery</s-button>
          <PermanentDelete event={e} busy={busy} call={call} run={run} refresh={refresh} onDeleted={setMessage}/>
        </s-box>)}
      </s-section>}
      {event && detail && <s-stack gap="base">
        <s-section heading={event.name}>
          <PhotoStation key={event.id} event={event} call={call} run={run} busy={busy}/>
          <GuestExperience key={'guest-'+event.id} event={event} call={call} run={run} busy={busy}/>
          <s-paragraph>{event.event_date} | {detail.photos.filter(p => p.ready).length} completed photos | {event.active ? 'Guest access enabled' : 'Guest access paused'}</s-paragraph>
          <s-button disabled={busy} onClick={() => run(async () => {await call('owner/events/' + event.id, {active: !event.active}); await reloadEvent();})}>{event.active ? 'Pause guest access' : 'Enable guest access'}</s-button>
        </s-section>
        <s-section heading="Delete gallery">
          <s-paragraph>Move this gallery to Trash and pause guest access. Photos, selections and order records are retained. This does not free storage. You can restore the gallery from Trash.</s-paragraph>
          <s-text-field label="Type the gallery name to confirm" value={deleteName} disabled={busy} onInput={e => setDeleteName(e.currentTarget.value)}/>
          <s-button disabled={busy || deleteName !== event.name} onClick={() => run(async () => {
            if (deleteName !== event.name) throw Error('Type the exact gallery name to confirm.');
            await call('owner/events/' + event.id, {action: 'trash', confirmName: deleteName});
            setEvent(null); setDetail(null); setDeleteName(''); setScreen('events'); await refresh(); setMessage('Gallery moved to Trash. Guest access is paused.');
          })}>Move gallery to Trash</s-button>
        </s-section>
        <UploadPanel key={event.id} eventId={event.id} call={call} run={run} busy={busy} reload={reloadEvent}/>
        <s-section heading="Photos">
          {!detail.photos.length && <s-paragraph>No photos yet. Upload this event's images above.</s-paragraph>}
          <s-table><s-table-header-row><s-table-header listSlot="primary">Photo</s-table-header><s-table-header>Status</s-table-header><s-table-header>Manage</s-table-header></s-table-header-row>
            <s-table-body>{detail.photos.slice(photoPage * 24, (photoPage + 1) * 24).map(p => <s-table-row key={p.id}><s-table-cell><OwnerPhoto photo={p} eventId={event.id} call={call} busy={busy}/></s-table-cell><s-table-cell>{!p.ready ? 'Upload incomplete' : p.hidden ? 'Hidden' : 'Visible'}</s-table-cell><s-table-cell>
              {p.ready ? <s-button disabled={busy} onClick={() => run(async () => {await call('owner/events/' + event.id + '/photos/' + p.id, {action: 'visibility', hidden: !p.hidden}); await reloadEvent();})}>{p.hidden ? 'Show photo' : 'Hide photo'}</s-button> : <s-stack direction="inline" gap="base">
                <s-button disabled={busy} onClick={() => run(async () => {await call('owner/events/' + event.id + '/photos/' + p.id, {action: 'process'}); await reloadEvent();})}>Retry finalizing</s-button>
                <s-button disabled={busy} onClick={() => run(async () => {await call('owner/events/' + event.id + '/photos/' + p.id, {action: 'discard'}); await reloadEvent();})}>Remove incomplete upload</s-button>
              </s-stack>}
            </s-table-cell></s-table-row>)}</s-table-body>
          </s-table>
        </s-section>
        {detail.photos.length > 24 && <s-stack direction="inline" gap="base">
          <s-button disabled={busy || photoPage === 0} onClick={() => setPhotoPage(photoPage - 1)}>Previous photos</s-button>
          <s-paragraph>Photos {photoPage * 24 + 1}–{Math.min((photoPage + 1) * 24, detail.photos.length)} of {detail.photos.length}</s-paragraph>
          <s-button disabled={busy || (photoPage + 1) * 24 >= detail.photos.length} onClick={() => setPhotoPage(photoPage + 1)}>Next photos</s-button>
        </s-stack>}
        <s-section heading="Guest access">
          {!detail.invitations.length && !detail.grants.length && <s-paragraph>No guests have access yet.</s-paragraph>}
          {detail.invitations.map(i => <s-box key={i.email} padding="base" border="base">
            <s-paragraph>{i.email} | {accessState(i)} | Expires {new Date(i.expires_at).toLocaleString()}</s-paragraph>
            <s-stack direction="inline" gap="base"><s-button disabled={busy} onClick={() => {setGuest(i.email); setExpires(i.expires_at.slice(0, 10));}}>Edit expiry below</s-button>{i.revoked && <s-button disabled={busy} onClick={() => run(async () => {await call('owner/events/' + event.id + '/access', {email: i.email, expiresAt: i.expires_at, revoked: false}); await reloadEvent();})}>Restore invitation</s-button>}</s-stack>
            <RemoveGuestAccess key={event.id + i.email} eventId={event.id} email={i.email} call={call} busy={busy} run={run} reload={reloadEvent}/>
          </s-box>)}
          {detail.grants.map(g => <s-box key={g.user_id} padding="base" border="base">
            <s-paragraph>Existing account {g.user_id} | {accessState(g)} | Expires {new Date(g.expires_at).toLocaleString()}</s-paragraph>
            {g.revoked && <s-button disabled={busy} onClick={() => run(async () => {await call('owner/events/' + event.id + '/grants', {userId: g.user_id, revoked: false}); await reloadEvent();})}>Restore account grant</s-button>}
            <RemoveGuestAccess key={event.id + g.user_id} eventId={event.id} userId={g.user_id} call={call} busy={busy} run={run} reload={reloadEvent}/>
          </s-box>)}
          <s-paragraph>Remove all access revokes both the invitation and account grant for this gallery. Restoring either one allows access again. Saving access does not send an invitation email.</s-paragraph>
          <s-email-field label="Guest email" value={guest} disabled={busy} onInput={e => setGuest(e.currentTarget.value)}/>
          <s-date-field label="Access expires (end of day UTC)" value={expires} disabled={busy} onInput={e => setExpires(e.currentTarget.value)}/>
          <s-button disabled={busy || !guest || !expires} onClick={() => run(async () => {const expiry = expires + 'T23:59:59Z'; if (!(Date.parse(expiry) > Date.now())) throw Error('Choose a future access expiry date.'); await call('owner/events/' + event.id + '/access', {email: guest, expiresAt: expiry, revoked: false}); await reloadEvent(); setMessage('Guest access saved.');})}>Save guest access</s-button>
        </s-section>
      </s-stack>}
      {!event && data && screen === 'storage' && <s-section heading="Private storage">
        <s-paragraph>Total gallery storage: {formatBytes(data.usage.reduce((n, b) => n + Number(b.bytes), 0))}</s-paragraph>
        {['gallery-originals', 'gallery-previews', 'gallery-exports'].map(id => {const b = data.usage.find(b => b.bucket_id === id); return <s-paragraph key={id}>{id}: {formatBytes(Number(b?.bytes || 0))} | {b?.objects || 0} files</s-paragraph>;})}
        <s-paragraph>Per-file limits: 15 MB originals and 1 MB previews. Gallery totals do not include unrelated project storage or database usage.</s-paragraph>
        <s-link href="https://supabase.com/dashboard/project/gefdlubvqymyxrguhtnc/storage/buckets" target="_blank">Open storage in Supabase</s-link>
        <s-paragraph>Your plan's included allowance and billing usage must be checked in Supabase. No unverified plan limit is assumed here.</s-paragraph>
      </s-section>}
      {!event && data && screen === 'orders' && <s-stack gap="base">
        <s-section heading="Shopify payment notifications">
          <s-paragraph>{data.lastPaymentDelivery ? 'Last verified notification: ' + new Date(data.lastPaymentDelivery).toLocaleString() : 'No verified notifications received yet.'}</s-paragraph>
          <s-paragraph>Showing the latest 200 payment records and saved selections.</s-paragraph>
          {!data.payments.length && <s-paragraph>No verified gallery orders received yet.</s-paragraph>}
          {data.payments.map(p => <s-paragraph key={p.order_id}>{p.order_name} | {p.financial_status}{p.refund_activity ? ' | Refund review required' : ''}{p.cancelled ? ' | Cancelled' : ''}{p.is_test ? ' | Test order' : ''}</s-paragraph>)}
        </s-section>
        {!data.requests.length && <s-section heading="Saved selections"><s-paragraph>No selections submitted yet.</s-paragraph></s-section>}
        {data.requests.map(r => <RequestCard key={r.id} request={r} events={data.events} payments={data.payments} busy={busy} call={call} run={run} refresh={refresh}/>)}
      </s-stack>}
    </s-stack>}
  </s-page>;
}
