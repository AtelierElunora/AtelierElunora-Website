// Reviewed, one-off additive migration for this release. No secrets are logged.
import {ManagedIdentityCredential} from '@azure/identity';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {bookingDatabaseConfig} from './booking-config.mjs';
const {identityClientId,...config}=bookingDatabaseConfig(process.env);
const credential=new ManagedIdentityCredential({clientId:identityClientId});
const pool=new pg.Pool({...config,connectionTimeoutMillis:30000,password:async()=>(await credential.getToken('https://ossrdbms-aad.database.windows.net/.default')).token});
let ok=false;
try {
 for(let attempt=0;attempt<3;attempt++){
  let client;
  try {
   client=await pool.connect();
   const columns=await client.query(`SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='elunora_booking' AND table_name='BookingLead' AND column_name IN ('referralSource','referralDetails')`);
   if(columns.rows.length!==2){
    await client.query('BEGIN');
    await client.query(await readFile(new URL('./booking-referral-source.sql',import.meta.url),'utf8'));
    await client.query('COMMIT');
   }
   const result=await client.query(`SELECT "referralSource","referralDetails" FROM elunora_booking."BookingLead" LIMIT 0`);
   console.log('Referral source database fields verified');ok=true;break;
  }catch(e){
   if(client)await client.query('ROLLBACK').catch(()=>{});
   console.error('Referral migration check failed',e.code||e.name);
   if(['42501','42P01'].includes(e.code))break;
   if(attempt<2)await new Promise(r=>setTimeout(r,2000));
  }finally{client?.release()}
 }
}finally{await pool.end()}
if(!ok)process.exitCode=1;
