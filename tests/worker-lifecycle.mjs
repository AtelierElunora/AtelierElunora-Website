import assert from 'node:assert/strict';
import {closeWorkerChannel} from '../print-helper/worker-lifecycle.mjs';
let calls=0;
const child={connected:true,disconnect(){calls++;this.connected=false;}};
closeWorkerChannel(child);closeWorkerChannel(child);
assert.equal(calls,1);
closeWorkerChannel({connected:false,disconnect(){throw Error('Not connected');}});
console.log('PASS: completed and failed workers release the IPC connection; standalone workers remain supported.');
