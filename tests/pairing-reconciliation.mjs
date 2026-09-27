import assert from 'node:assert/strict';
import {reconcileBeforePairing} from '../print-helper/automatic-engine.mjs';
for(const state of ['operator','released','completed','active',null]){
 let archived=null;const run={id:'run',runId:'run',sheets:[{localState:'awaiting-confirmation'}]};
 const journal={read:async()=>run,archive:async r=>archived=r};
 const action=()=>reconcileBeforePairing(journal,async id=>{assert.equal(id,'run');return {runState:state};});
 if(['operator','released','completed'].includes(state)){await action();assert.equal(archived.reconciledAs,state);assert.deepEqual(archived.sheets,run.sheets);}
 else {await assert.rejects(action,/Resolve the active run/);assert.equal(archived,null);}
}
let archived=false;await assert.rejects(reconcileBeforePairing({read:async()=>({runId:'run'}),archive:async()=>archived=true},async()=>{throw Error('offline');}),/offline/);assert.equal(archived,false);
await reconcileBeforePairing({read:async()=>null},async()=>{throw Error('Should not call');});
console.log('PASS: resolved runs archive before pairing; active, unknown and unreachable runs remain protected.');
