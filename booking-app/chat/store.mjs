import pg from 'pg';
import {ManagedIdentityCredential} from '@azure/identity';
import {randomUUID} from 'node:crypto';
import {bookingDatabaseConfig} from '../azure/booking-config.mjs';
import {defaults,validateSettings} from './core.mjs';

export class ChatStore {
  constructor(pool) { this.pool=pool; }
  async settings(shop) {
    const {rows}=await this.pool.query('SELECT config,revision FROM elunora_chat.settings WHERE shop=$1',[shop]);
    return rows[0] ? {config:validateSettings(rows[0].config),revision:rows[0].revision} : {config:structuredClone(defaults),revision:0};
  }
  async save(shop,config,revision) {
    const clean=validateSettings(config);
    const {rows}=await this.pool.query(`INSERT INTO elunora_chat.settings(shop,config) SELECT $1,$2::jsonb WHERE $3=0
      ON CONFLICT(shop) DO UPDATE SET config=EXCLUDED.config,revision=elunora_chat.settings.revision+1,updated_at=now() WHERE elunora_chat.settings.revision=$3 RETURNING revision`,[shop,JSON.stringify(clean),revision]);
    if (rows[0]) return rows[0].revision;
    if (revision!==0) {
      const updated=await this.pool.query('UPDATE elunora_chat.settings SET config=$2::jsonb,revision=revision+1,updated_at=now() WHERE shop=$1 AND revision=$3 RETURNING revision',[shop,JSON.stringify(clean),revision]);
      if(updated.rows[0]) return updated.rows[0].revision;
    }
    throw Error('Settings changed in another window. Reload before saving.');
  }
  async rate(key,limit,seconds) {
    const window=Math.floor(Date.now()/(seconds*1000));
    const {rows}=await this.pool.query(`INSERT INTO elunora_chat.rate(key,bucket,hits,expires_at) VALUES($1,$2,1,now()+($4 * interval '1 second'))
      ON CONFLICT(key,bucket) DO UPDATE SET hits=elunora_chat.rate.hits+1 WHERE elunora_chat.rate.hits<$3 RETURNING hits`,[key,window,limit,seconds]);
    return rows.length>0;
  }
  async reserve(shop,config,tokens) {
    const month=new Date().toISOString().slice(0,7);
    const {rows}=await this.pool.query(`INSERT INTO elunora_chat.usage(shop,month,requests,tokens) SELECT $1,$2,1,$3::bigint WHERE $3::bigint<=$5::bigint
      ON CONFLICT(shop,month) DO UPDATE SET requests=elunora_chat.usage.requests+1,tokens=elunora_chat.usage.tokens+$3
      WHERE elunora_chat.usage.requests<$4 AND elunora_chat.usage.tokens+$3<=$5 RETURNING requests`,[shop,month,tokens,config.monthlyRequests,config.monthlyTokens]);
    return rows[0] ? {month,tokens} : null;
  }
  async settle(shop,reservation,actual) {
    if (!Number.isSafeInteger(actual) || actual<0 || actual>reservation.tokens) return;
    await this.pool.query('UPDATE elunora_chat.usage SET tokens=GREATEST(0,tokens-$3) WHERE shop=$1 AND month=$2',[shop,reservation.month,reservation.tokens-actual]);
  }
  async usage(shop) {
    const {rows}=await this.pool.query('SELECT requests,tokens FROM elunora_chat.usage WHERE shop=$1 AND month=$2',[shop,new Date().toISOString().slice(0,7)]);
    return rows[0] || {requests:0,tokens:0};
  }
  async inquiry(shop,details) {
    const id=randomUUID();
    await this.pool.query('INSERT INTO elunora_chat.inquiry(id,shop,details) VALUES($1,$2,$3::jsonb)',[id,shop,JSON.stringify(details)]);
    return id;
  }
  async inbox(shop) {
    return (await this.pool.query('SELECT id,details,status,created_at FROM elunora_chat.inquiry WHERE shop=$1 ORDER BY created_at DESC LIMIT 50',[shop])).rows;
  }
  async reviewed(shop,id) { await this.pool.query("UPDATE elunora_chat.inquiry SET status='reviewed' WHERE shop=$1 AND id=$2",[shop,id]); }
}
let singleton;
export function chatStore(env=process.env) {
  if (singleton) return singleton;
  if (env.ELUNORA_DATABASE_BACKEND!=='azure-postgres') throw Error('Chat requires the reviewed PostgreSQL schema.');
  const {identityClientId,...config}=bookingDatabaseConfig(env);
  const credential=new ManagedIdentityCredential({clientId:identityClientId});
  const pool=new pg.Pool({...config,max:2,application_name:'atelier-elunora-chat',password:async()=>{
    const token=await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');
    if(!token?.token) throw Error('Chat database authentication unavailable');
    return token.token;
  }});
  pool.on('error',()=>console.error('Chat database connection unavailable'));
  return singleton=new ChatStore(pool);
}
