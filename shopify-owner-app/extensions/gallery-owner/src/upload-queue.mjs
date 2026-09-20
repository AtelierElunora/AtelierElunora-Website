import {validatePhoto, uploadSigned} from './workflows.mjs';

// File handles and upload capabilities stay in memory, never localStorage.
export const fileKey = file => JSON.stringify([file.name, file.size, file.type, file.lastModified]);
export function addFiles(jobs, files) {
  const keys = new Set(jobs.map(job => job.key));
  const added = [];
  let skipped = 0;
  for (const file of files) {
    const key = fileKey(file);
    if (keys.has(key)) { skipped++; continue; }
    keys.add(key);
    const job = {key, file, status: 'queued', stage: '', error: '', prepared: null, transferred: false, review: false};
    try { validatePhoto(file); } catch (e) { job.status = 'invalid'; job.error = e.message; }
    added.push(job);
  }
  return {jobs: [...jobs, ...added], skipped};
}
const transient = e => !e.status || e.status === 408 || e.status === 429 || e.status >= 500;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function retry(fn, job, notify, wait) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt >= 2 || !transient(e)) throw e;
      job.stage = 'Connection interrupted; retrying automatically'; notify();
      await wait(1000 * 2 ** attempt);
    }
  }
}
export async function runUploadQueue(jobs, eventId, call, notify = () => {}, options = {}) {
  const {transfer = uploadSigned, wait = sleep, concurrency = 3, stopped = () => false} = options;
  const pending = jobs.filter(job => job.status === 'queued' || (job.status === 'failed' && !job.review));
  let next = 0;
  async function worker() {
    while (next < pending.length && !stopped()) {
      const job = pending[next++];
      job.status = 'uploading'; job.error = ''; notify();
      try {
        if (!job.prepared) {
          job.stage = 'Preparing secure upload'; notify();
          // This route creates a row. Never repeat it after an ambiguous response.
          try {
            job.prepared = await call('owner/events/' + eventId + '/upload', {filename: job.file.name, mime: job.file.type, bytes: job.file.size});
            if (!job.prepared?.photoId || !job.prepared?.originalUrl) throw Error('Upload preparation response was incomplete.');
          } catch (e) {
            job.review = true;
            throw Error('Could not confirm upload preparation. Check incomplete photos before selecting this file again.');
          }
        }
        if (!job.transferred) {
          job.stage = 'Uploading original'; notify();
          await retry(async () => {
            try { await transfer(job.prepared.originalUrl, job.file); }
            catch (e) {
              // The exact same immutable object may already exist after a lost response.
              // Only an explicit storage duplicate permits continuing to server validation.
              if (e.code !== 'Duplicate' && e.status !== 409) throw e;
            }
          }, job, notify, wait);
          job.transferred = true;
        }
        job.stage = 'Creating preview'; notify();
        await retry(() => call('owner/events/' + eventId + '/photos/' + job.prepared.photoId, {action: 'process'}), job, notify, wait);
        job.status = 'done'; job.stage = 'Uploaded';
      } catch (e) {
        job.status = 'failed'; job.error = e.message || 'Upload failed. Please retry.';
      }
      notify();
    }
  }
  await Promise.all(Array.from({length: Math.min(3, Math.max(1, concurrency), pending.length)}, worker));
}
