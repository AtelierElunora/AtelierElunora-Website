/** @jsxRuntime classic */
/** @jsx h */
import {h} from 'preact';
import {useState,useEffect,useRef} from 'preact/hooks';
import {orderContact,STATUSES,linkedPayments,paymentReview,formatBytes,accessState} from './workflows.mjs';
import {addFiles,runUploadQueue} from './upload-queue.mjs';
const errorText=e=>e instanceof Error?e.message:'Please retry.';
export function RemoveGuestAccess({eventId, email, userId, call, busy, run, reload}) {
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

export function OwnerPhoto({photo, eventId, call, busy}) {
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

export function UploadPanel({eventId, busy, run, call, reload}) {
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

export function PermanentDelete({event, busy, call, run, refresh, onDeleted}) {
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

export function RequestCard({request, payments, events, call, run, busy, refresh}) {
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
    <s-paragraph>{orderContact(request,payments)} | {new Date(request.created_at).toLocaleString()} | {request.status}</s-paragraph>
    <s-paragraph>Selection reference: {request.id}</s-paragraph>
    <s-paragraph>{paymentReview(request, payments)}{linked.length ? ' | ' + linked.map(p => p.order_name + ' (' + p.financial_status + ')').join(', ') : ''}</s-paragraph>
    <s-select label="Preparation status" value={status} disabled={busy} onChange={e => setStatus(e.currentTarget.value)}>
      {STATUSES.map(s => <s-option key={s} value={s}>{s}</s-option>)}
    </s-select>
    <s-button disabled={busy || status === request.status} onClick={() => run(async () => {await call('owner/requests/' + request.id, {status}); await refresh();})}>Save preparation status</s-button>
    <s-paragraph>Preparation status does not change payment or fulfillment in Shopify.</s-paragraph>
    <s-button disabled={busy} onClick={() => run(showPhotos)}>{expanded ? 'Hide selected photos' : 'View selected photos'}</s-button>
    <s-button disabled={busy || paymentReview(request,payments)!=='Verified paid order'} onClick={()=>run(async()=>{await call('owner/production',{requestId:request.id});await refresh();})}>Queue paid order for printing</s-button>
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

export function OwnerMfa({call, onVerified, onCancel, alreadyVerified}) {
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

