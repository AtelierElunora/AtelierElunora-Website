// A forked worker's IPC channel otherwise keeps Node alive after its work ends.
export function closeWorkerChannel(worker=process){
 if(worker.connected)worker.disconnect();
}
