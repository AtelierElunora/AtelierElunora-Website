export const WAIT_MS = 135 * 60 * 1000;
export function publicInventory(event, inventory, now = Date.now()) {
 const availableAt = new Date(Date.parse(event.deleted_at) + WAIT_MS).toISOString();
 return {photoCount: Number(inventory.photoCount), fileCount: Number(inventory.fileCount), bytes: Number(inventory.bytes), blockingRequests: Number(inventory.blockingRequests), unknownExports: Number(inventory.unknownExports || 0), availableAt, canDelete: !!event.deleted_at && !event.active && Date.parse(availableAt) <= now && Number(inventory.blockingRequests) === 0 && !Number(inventory.unknownExports || 0), started: !!event.purge_started_at};
}
// Called only after the existing handler has authenticated and verified owner access.
export async function purgeEvent(event, body, service, reply, now = Date.now()) {
 if (!event.deleted_at || event.active) return reply({error:'Move this gallery to Trash first.'},409);
 const inspected = await service.rpc('gallery_purge_inventory',{target:event.id});
 if (inspected.error || !inspected.data) return reply({error:'Could not verify files and outstanding requests. No deletion started.'},503);
 const summary = publicInventory(event,inspected.data,now);
 if (!body) return reply(summary);
 if(body.confirmName !== event.name || body.acknowledge !== true) return reply({error:'Type the exact event name and confirm permanent deletion.'},400);
 if (!summary.canDelete) return reply({...summary,error: summary.blockingRequests ? 'Complete or cancel outstanding gallery requests before deleting. Review Shopify orders too.' : summary.unknownExports ? 'Unrecognized print export paths need review before deletion.' : 'Recent upload links are still expiring. Return after the displayed time.'},409);
 const begun = await service.rpc('gallery_begin_purge',{target:event.id,confirm_name:body.confirmName});
 if(begun.error || !begun.data) return reply({error:'Could not lock this gallery for deletion. Refresh its deletion review and retry.'},409);
 // The SQL operation locks the event against restore/changes and rechecks open requests.
 // Storage API removes physical bytes; never delete storage.objects rows using SQL.
 for (const bucket of ['gallery-originals','gallery-previews','gallery-exports']) {
  const paths = begun.data.files.filter(f=>f.bucket_id===bucket).map(f=>f.name);
  if (!paths.length) continue;
  const removed=await service.storage.from(bucket).remove(paths);
  if(removed.error) return reply({error:'Deletion paused because some files could not be removed. The gallery remains locked in Trash. Use Retry permanent deletion.'},503);
 }
 const remaining = await service.rpc('gallery_purge_inventory',{target:event.id});
 if(remaining.error || !remaining.data) return reply({error:'Could not verify remaining files. Retry permanent deletion; completed removals will not be repeated.'},503);
 if(Number(remaining.data.fileCount)>0) return reply({...publicInventory({...event,purge_started_at:'started'},remaining.data,now),deleted:false});
 const finished = await service.rpc('gallery_finish_purge',{target:event.id});
 if(finished.error) return reply({error:'Files removed, but event cleanup is incomplete. Retry permanent deletion.'},503);
 return reply({deleted:true,fileCount:0,bytes:0});
}
