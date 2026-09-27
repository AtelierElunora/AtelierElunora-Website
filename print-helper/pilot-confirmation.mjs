// Local sample-pilot fallback only; no production queue updates.
export const acceptsConfirmation=answer=>typeof answer==='string'&&answer.trim().toLowerCase()==='yes';
export async function confirmPilotSheet(journal,expectedJob){
 const run=await journal.read(),sheet=run?.sheets.find(s=>s.localState!=='recorded');
 if(!sheet||sheet.localState!=='submitted'||!expectedJob||sheet.spoolerJob!==expectedJob)throw Error('Saved job changed. Inspect the queue before confirming.');
 sheet.localState='recorded';sheet.completionSource='operator';sheet.confirmedAt=new Date().toISOString();await journal.write(run);
 return {sheetId:sheet.id,spoolerJob:sheet.spoolerJob,state:'operator-confirmed',confirmedAt:sheet.confirmedAt};
}
