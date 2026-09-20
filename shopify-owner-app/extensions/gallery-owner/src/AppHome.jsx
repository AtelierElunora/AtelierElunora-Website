import {PhotoStation} from './PhotoStation.jsx';
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

function RemoveGuestAccess({eventId, email, userId, call, busy, run, reload}) {
  const [confirming, setConfirming] = useState(false), [removed, setRemoved] = useState(false);
  return <s-stack gap="base">
    {removed && <s-paragraph>All guest access to this gallery was removed.</s-paragraph>}
    {!confirming ? <s-button disabled={busy} onClick={() => {setRemoved(false); setConfirming(true);}}>Remove all access</s-button> : <s-stack gap="base">
      <s-paragraph>Remove invitation and account access for {email || userId} from this gallery? Other galleries are unaffected. Previously downloaded photos cannot be recalled.</s-paragraph>
      <s-stack direction="inline" gap="base">
        <s-button disabled={busy} onClick={() => run(async () => {
          await call('owner/events/' + eventId + '/remove-access', {...(email ? {email} : {userId}), confirm: true});
          await reload(); setConfirming(false); setRemoved(true);
        })}>Confirm removal</s-button>
        <s-button disabled={busy} onClick={() => setConfirming(false)}>Cancel removal</s-button>
      </s-stack>
    </s-stack>}
  </s-stack>;
}

function OwnerPhoto({photo, eventId, call, busy}) {
  const [preview, setPreview] = useState(''), [download, setDownload] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const alive = useRef(true), expiry = useRef(null);
  useEffect(() => {
    alive.current = true;
    if (photo.ready) call('owner/events/' + eventId + '/photos/' + photo.id + '/preview-url')
      .then(d => { if (alive.current) setPreview(d.url); }).catch(e => { if (alive.current) setError(errorText(e)); });
    return () => { alive.current = false; clearTimeout(expiry.current); };
  }, [photo.id, photo.ready, eventId]);
  async function original() {
    if (loading) return;
    setLoading(true); setError(''); setDownload('');
    try {
      const d = await call('owner/events/' + eventId + '/photos/' + photo.id + '/original');
      if (alive.current) {
        setDownload(d.url); clearTimeout(expiry.current);
        expiry.current = setTimeout(() => setDownload(''), 55000);
      }
    } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { if (alive.current) setLoading(false); }
  }
  return <s-stack gap="base">
    {preview && <s-image src={preview} alt={photo.filename} aspectRatio="1/1" objectFit="contain" loading="lazy"/>}
    <s-text>{photo.filename}</s-text>
    {photo.original_bytes > 0 && <s-button disabled={busy || loading} onClick={original}>Prepare original download</s-button>}
    {download && <s-link href={download} target="_blank">Download original (expires in one minute)</s-link>}
    {error && <s-text>{error}</s-text>}
  </s-stack>;
}

function UploadPanel({eventId, busy, run, call, reload}) {
  const [jobs, setJobs] = useState([]), [notice, setNotice] = useState(''), [running, setRunning] = useState(false);
  const picker = useRef(null), queue = useRef([]), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const publish = () => { if (alive.current) setJobs([...queue.current]); };
  const done = jobs.filter(j => j.status === 'done').length;
  const failed = jobs.filter(j => j.status === 'failed' || j.status === 'invalid');
  const pending = jobs.filter(j => j.status === 'queued').length;
  const retryable = jobs.filter(j => j.status === 'failed' && !j.review).length;
  async function upload() {
    setRunning(true); setNotice('');
    try {
      await runUploadQueue(queue.current, eventId, call, publish, {stopped: () => !alive.current});
      if (alive.current) setNotice('Batch finished. Successful photos are saved; any failed photos are listed below.');
    } finally {
      if (alive.current) { setRunning(false); await reload(); }
    }
  }
  return <s-section heading="Upload event photos">
    <s-paragraph>Select the whole event at once, including 200+ photos. Uploads run automatically, three at a time. Keep this app open and your device awake until the batch finishes.</s-paragraph>
    <s-paragraph>JPEG, PNG or WebP, up to 15 MB per original. Private previews are created automatically. JPEGs up to 60 megapixels; PNG and WebP up to 12 megapixels. Extract ZIP downloads before selecting photos.</s-paragraph>
    <s-drop-zone ref={picker} label="Choose event photos" accept="image/jpeg,image/png,image/webp" multiple disabled={busy}
      onChange={e => {
        const result = addFiles(queue.current, [...e.currentTarget.files]); queue.current = result.jobs; publish();
        setNotice(result.skipped ? `${result.skipped} repeated selections skipped in this batch.` : 'All selected photos are queued. Click Upload once to start.');
      }}
      onDropRejected={() => setNotice('Some files were rejected. Choose JPEG, PNG or WebP images.')}/>
    <s-button variant="primary" disabled={busy || !pending} onClick={() => run(upload)}>Upload {pending || ''} photos</s-button>
    {retryable > 0 && <s-button disabled={busy} onClick={() => run(upload)}>Retry {retryable} failed photos</s-button>}
    {jobs.length > 0 && <s-paragraph>{done} of {jobs.length} photos uploaded | {failed.length} need attention{running ? ' | Uploading automatically' : ''}</s-paragraph>}
    {jobs.filter(j => j.status === 'uploading').map(j => <s-paragraph key={j.key}>{j.file.name}: {j.stage}</s-paragraph>)}
    {notice && <s-paragraph>{notice}</s-paragraph>}
    {failed.slice(0, 10).map(j => <s-paragraph key={j.key}>{j.file.name}: {j.error}</s-paragraph>)}
    {failed.length > 10 && <s-paragraph>{failed.length - 10} more files need attention. Retry failed photos to continue.</s-paragraph>}
    {jobs.length > 0 && !running && <s-button disabled={busy} onClick={() => {queue.current = []; setJobs([]); setNotice('Selection cleared. Previously uploaded photos remain saved.'); if (picker.current) picker.current.value = '';}}>Clear selection</s-button>}
  </s-section>;
}

function PermanentDelete({event, busy, call, run, refresh, onDeleted}) {
  const [review, setReview] = useState(null), [name, setName] = useState(''), [ack, setAck] = useState(false), [progress, setProgress] = useState('');
  const route = 'owner/events/' + event.id + '/permanent-delete';
  async function inspect() { setReview(await call(route)); setName(''); setAck(false); setProgress(''); }
  async function remove() {
    // Confirmation is tied to this event and checked again on the server.
    if (name !== event.name || !ack || !review?.canDelete) return;
    setProgress('Deleting stored photos. Keep this page open.');
    try {
      for (;;) {
        const result = await call(route, {confirmName: name, acknowledge: true});
        if (result.deleted) { await refresh(); onDeleted('Event permanently deleted. Stored files and gallery access were removed; Shopify payment records remain.'); return; }
        setReview(result); setProgress(`${result.fileCount} stored files remaining. Deleting automatically…`);
      }
    } catch (e) {
      setProgress('Deletion paused. Review the message above, then retry. Successfully removed files stay deleted.');
      await refresh(); throw e;
    }
  }
  return <s-stack gap="base">
    <s-button disabled={busy} onClick={() => run(inspect)}>Review permanent deletion</s-button>
    {review && <s-stack gap="base">
      <s-paragraph>{review.photoCount} photos | {review.fileCount} stored files | {formatBytes(review.bytes)} remaining</s-paragraph>
      <s-paragraph>This permanently removes originals, previews, associated print exports, saved selections and gallery access. It cannot be undone. Download anything you want to keep first. Shopify orders and payment records are preserved.</s-paragraph>
      <s-paragraph>Check Shopify for unfulfilled orders or open checkouts before continuing. Gallery preparation status does not automatically track Shopify fulfillment.</s-paragraph>
      {review.blockingRequests > 0 && <s-paragraph>{review.blockingRequests} outstanding gallery requests must be completed or cancelled first. Restore the gallery to review those requests.</s-paragraph>}
      {review.unknownExports > 0 && <s-paragraph>Some print exports need a storage-path review before permanent deletion is available.</s-paragraph>}
      {Date.parse(review.availableAt) > Date.now() && <s-paragraph>Available after {new Date(review.availableAt).toLocaleString()}. Recent upload links must expire first. Return here and review again after that time.</s-paragraph>}
      <s-text-field label="Type the event name to permanently delete" value={name} disabled={busy} onInput={e => setName(e.currentTarget.value)}/>
      <s-checkbox label="I saved what I need, checked outstanding orders, and understand this cannot be undone." checked={ack} disabled={busy} onChange={e => setAck(e.currentTarget.checked)}/>
      <s-button tone="critical" disabled={busy || !review.canDelete || name !== event.name || !ack} onClick={() => run(remove)}>{event.purge_started_at || review.started ? 'Retry permanent deletion' : 'Permanently delete event'}</s-button>
      {progress && <s-paragraph>{progress}</s-paragraph>}
    </s-stack>}
  </s-stack>;
}

function RequestCard({request, payments, events, call, run, busy, refresh}) {
  const [status, setStatus] = useState(request.status), [expanded, setExpanded] = useState(false), [photos, setPhotos] = useState(null);
  useEffect(() => setStatus(request.status), [request.status]);
  const event = events.find(e => e.id === request.event_id);
  const linked = linkedPayments(request, payments);
  async function showPhotos() {
    if (expanded) { setExpanded(false); return; }
    const detail = await call('owner/events/' + request.event_id);
    setPhotos(detail.photos); setExpanded(true);
  }
  return <s-section heading={`${event?.name || 'Event'} | ${request.items.reduce((n, i) => n + i.quantity, 0)} magnets`}>
    <s-paragraph>{request.email} | {new Date(request.created_at).toLocaleString()} | {request.status}</s-paragraph>
    <s-paragraph>Selection reference: {request.id}</s-paragraph>
    <s-paragraph>{paymentReview(request, payments)}{linked.length ? ' | ' + linked.map(p => p.order_name + ' (' + p.financial_status + ')').join(', ') : ''}</s-paragraph>
    <s-select label="Preparation status" value={status} disabled={busy} onChange={e => setStatus(e.currentTarget.value)}>
      {STATUSES.map(s => <s-option key={s} value={s}>{s}</s-option>)}
    </s-select>
    <s-button disabled={busy || status === request.status} onClick={() => run(async () => {await call('owner/requests/' + request.id, {status}); await refresh();})}>Save preparation status</s-button>
    <s-paragraph>Preparation status does not change payment or fulfillment in Shopify.</s-paragraph>
    <s-button disabled={busy} onClick={() => run(showPhotos)}>{expanded ? 'Hide selected photos' : 'View selected photos'}</s-button>
    {expanded && <s-stack gap="base">
      <s-banner tone="info">These downloads are original photos. The saved crop positions below must still be applied before printing. Cropped print exports remain available in the existing owner portal.</s-banner>
      {request.items.map(item => {
        const photo = photos.find(p => p.id === item.photoId);
        return <s-box key={item.photoId} padding="base" border="base">
          {photo ? <OwnerPhoto photo={photo} eventId={request.event_id} call={call} busy={busy}/> : <s-text>Photo unavailable: {item.photoId}</s-text>}
          <s-paragraph>Quantity: {item.quantity} | Square crop position: {item.x}% horizontal / {item.y}% vertical</s-paragraph>
        </s-box>;
      })}
    </s-stack>}
  </s-section>;
}

function OwnerMfa({call, onVerified, onCancel, alreadyVerified}) {
  const [status, setStatus] = useState(null), [factorId, setFactorId] = useState('');
  const [secret, setSecret] = useState(''), [authCode, setAuthCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const working = useRef(false);
  async function run(action) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(errorText(e)); }
    finally { working.current = false; setBusy(false); }
  }
  async function load() {
    const next = await call('mfa/status'); setStatus(next);
    setFactorId(next.factors[0]?.id || '');
  }
  useEffect(() => { run(load); }, []);
  async function enroll() {
    const next = await call('mfa/enroll', {});
    setFactorId(next.factorId); setSecret(next.secret); setAuthCode('');
  }
  async function verify() {
    if (!/^[0-9]{6}$/.test(authCode)) throw Error('Enter the six-digit authenticator code.');
    const next = await call('mfa/verify', {factorId, code: authCode});
    setAuthCode(''); setSecret('');
    await onVerified(next);
  }
  return <s-section heading={alreadyVerified ? 'Add a backup authenticator' : 'Protect your owner account'}>
    <s-stack gap="base">
      {error && <s-banner tone="warning">{error}</s-banner>}
      <s-paragraph>Your gallery authenticator is separate from your Supabase dashboard authenticator. Customers do not need this extra step.</s-paragraph>
      {!status && <s-button disabled={busy} onClick={() => run(load)}>Load authenticator options</s-button>}
      {status && !secret && status.factors.length > 0 && !alreadyVerified && <s-select label="Authenticator" value={factorId} disabled={busy} onChange={e => {setFactorId(e.currentTarget.value); setAuthCode('');}}>
        {status.factors.map(f => <s-option key={f.id} value={f.id}>{f.name}</s-option>)}
      </s-select>}
      {status && !secret && (alreadyVerified || status.factors.length === 0) && <s-button disabled={busy} onClick={() => run(enroll)}>Set up authenticator</s-button>}
      {secret && <s-stack gap="base">
        <s-paragraph>In your authenticator app, add a time-based account named Atelier Elunora Gallery and choose Enter a setup key. Enter the key below, then enter the six-digit code here.</s-paragraph>
        <s-text-field label="Private setup key" value={secret} readOnly/>
        <s-paragraph>Keep this key private. Store a backup securely or add another authenticator on a separate device after signing in.</s-paragraph>
      </s-stack>}
      {status && factorId && (secret || !alreadyVerified) && <s-stack gap="base">
        <s-text-field label="Six-digit authenticator code" value={authCode} maxLength={6} disabled={busy} onInput={e => setAuthCode(e.currentTarget.value.replace(/[^0-9]/g, '').slice(0,6))}/>
        <s-button variant="primary" disabled={busy || authCode.length !== 6} onClick={() => run(verify)}>{status.required ? 'Verify authenticator' : 'Verify and enable MFA'}</s-button>
      </s-stack>}
      {!secret && status?.aal === 'aal2' && <s-button disabled={busy} onClick={() => run(() => onVerified(null))}>Continue with verified session</s-button>}
      <s-paragraph>If you lose access to all authenticators, use your protected Supabase administrator account for a reviewed recovery. Email alone cannot disable gallery MFA.</s-paragraph>
      <s-button disabled={busy} onClick={onCancel}>{alreadyVerified ? 'Back to galleries' : 'Disconnect owner account'}</s-button>
    </s-stack>
  </s-section>;
}

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
