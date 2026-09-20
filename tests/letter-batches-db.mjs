import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.gallery_admins(user_id uuid primary key);create table gallery_events(id uuid primary key,name text,deleted_at timestamptz,purge_started_at timestamptz);create table gallery_photos(id uuid primary key,event_id uuid references gallery_events(id),filename text,sample_asset text,original_key text,preview_key text,position integer,ready boolean,hidden boolean,original_bytes bigint default 0,preview_bytes bigint default 0);create table gallery_activity_log(source text,actor_user_id uuid,event_id uuid,action text,outcome text,subject_reference text,details jsonb);grant usage on schema public,auth to service_role;grant all on all tables in schema public,auth to service_role;`);
for(const f of ['20260920025307_event_photo_station','20260920025317_photo_station_zoom','20260920183216_magnet_wrap_template','20260920202808_letter_print_batches'])await db.exec(await readFile(new URL('../supabase/migrations/'+f+'.sql',import.meta.url),'utf8'));
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const event=uuid(1),owner=uuid(2),other=uuid(3),printer='b'.repeat(64),capture='c'.repeat(64),otherPrinter='d'.repeat(64),template={enabled:true,cutInches:3.6,background:'#123456'};
await db.query('insert into auth.users values($1)',[owner]);await db.query('insert into gallery_admins values($1)',[owner]);await db.query('insert into gallery_events(id,name) values($1,\'Test\'),($2,\'Other\')',[event,other]);
for(const [hash,purpose,e] of [[printer,'print',event],[capture,'capture',event],[otherPrinter,'print',other]])await db.query("insert into gallery_stations(event_id,actor_id,token_hash,purpose,expires_at) values($1,$2,$3,$4,now()+interval '12 hours')",[e,owner,hash,purpose]);
await db.exec('set role service_role');
async function add(n,q=1,hidden=false){await db.query('insert into gallery_photos(id,event_id,ready,hidden) values($1,$2,true,$3)',[uuid(n),event,hidden]);await db.query('insert into gallery_print_jobs(id,event_id,quantity) values($1,$2,$3)',[uuid(n),event,q]);}
const claim=async(request=100,t=template,partial=false,hash=printer)=>(await db.query('select gallery_letter_claim($1,$2,$3,$4) as result',[hash,uuid(request),t,partial])).rows[0].result;
const finish=async(id,action,hash=printer)=>(await db.query('select gallery_letter_finish($1,$2,$3) as result',[hash,id,action])).rows[0].result;
for(let n=10;n<15;n++)await add(n);
assert.deepEqual(await claim(),{waiting:true,count:5});await add(15);await add(16,2);await add(17,1,true);
await assert.rejects(claim(100,{...template,cutInches:3.75}),/at most 3.6/);
assert.equal((await db.query("select count(*)::int as n from gallery_print_jobs where status='printing'")).rows[0].n,0);
await assert.rejects(claim(100,template,false,capture),/Station unavailable/);
const b=await claim();assert.equal(b.created,true);assert.equal(b.jobs.length,6);assert.deepEqual(b.jobs.map(j=>j.letter_slot),[0,1,2,3,4,5]);assert.ok(b.jobs.every(j=>j.template.background==='#123456'));
assert.equal((await claim()).created,false);assert.equal((await claim(101)).id,b.id);assert.equal((await claim(101)).created,false);
assert.deepEqual(await claim(102,template,false,otherPrinter),{waiting:true,count:0});assert.equal((await finish(b.id,'printed',otherPrinter)).updated,0);
await assert.rejects(db.query("select gallery_print_update($1,$2,$3,'printed')",[printer,b.jobs[0].id,b.jobs[0].version]),/batch controls/);
assert.equal((await finish(b.id,'printed')).updated,6);assert.equal((await finish(b.id,'printed')).updated,0);assert.equal((await claim()).created,false);
await add(18);await add(19);const partial=await claim(103,template,true);assert.equal(partial.jobs.length,2);assert.equal((await finish(partial.id,'release')).updated,2);assert.equal((await claim(104)).count,2);
const retried=await claim(105,{...template,background:'#000000'},true);assert.ok(retried.jobs.every(j=>j.template.background==='#123456')); // Snapshot survives retries.
for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(claim(106),/permission denied/);await assert.rejects(finish(retried.id,'printed'),/permission denied/);}
await db.exec('reset role');await db.query('update gallery_stations set revoked=true where token_hash=$1',[printer]);await db.exec('set role service_role');await assert.rejects(finish(retried.id,'printed'),/Station unavailable/);
await db.close();console.log('PASS: letter SQL full/partial batching, idempotency, competing requests, event isolation, capability/grants, template snapshots, cut validation, atomic confirmation/release and individual-job guard.');
