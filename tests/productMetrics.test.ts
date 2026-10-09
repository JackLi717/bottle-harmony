import assert from 'node:assert/strict';
import test from 'node:test';
import { TestDatabase } from './helpers/sqlite.ts';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { MemoryRepository } from '../src/storage/memoryRepository.ts';
import { readyMemory, moveMemory, undoMemory, resetMemory } from '../src/game/memory.ts';
import { MetricClock, splitLocalDays } from '../src/storage/metricTime.ts';
import { transaction } from '../src/storage/sql.ts';
import { AnalyticsDelivery } from '../src/analytics/delivery.ts';
import type { AnalyticsGateway } from '../src/analytics/contracts.ts';
import { ANALYTICS_EVENTS, validateParameters } from '../src/analytics/contracts.ts';
import { localAnalyticsReport } from '../src/analytics/report.ts';
import { REPORT_SECTIONS } from '../src/analytics/reportDefinitions.ts';
const source = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(source);
async function setup() { const db = new TestDatabase(); const player = await PlayerRepository.open(db, content.mainline, content.sides, 'test'); await db.runAsync("INSERT INTO metadata VALUES('analytics-environment','test')"); return {db,player}; }
const context = {slot:'main', mode:'mainline', levelId:'test-level',catalog:'test',rules:'water-sort-v1',number:1,existing:false,completed:false,routePosition:0};

test('saved report definitions cover every declared product event',()=>{
 assert.deepEqual([...new Set(REPORT_SECTIONS.flatMap(section=>[...section.events]))].sort(),[...ANALYTICS_EVENTS].sort());
});

test('challenge totals span resets and clean pauses; first completion freezes and summaries survive pruning', async () => {
 const {db,player}=await setup(); const m=player.metrics;
 await transaction(db,async()=>{
  await m.record(1,10000,context,{kind:'show'});
  await m.record(2,11000,context,{kind:'pour',totals:{pours:1,foreground_ms:1000}});
  await m.record(3,12000,context,{kind:'reset',totals:{resets:1,foreground_ms:1000}});
  await m.record(4,13000,context,{kind:'pause'});
 });
 await transaction(db,()=>m.initialize(14000));
 assert.equal(db.getFirstSync<{partial:number}>('SELECT partial FROM metric_runs')!.partial,0);
 await transaction(db,async()=>{
  await m.record(5,15000,context,{kind:'show'});
  await m.record(6,16000,context,{kind:'pour',totals:{pours:1,foreground_ms:1000},completion:'solved'});
 });
 const fact=db.getFirstSync<{summary:string}>('SELECT summary FROM metric_firsts')!.summary;
 assert.deepEqual(JSON.parse(fact).totals,{attempts:2,visits:2,pours:2,foreground_ms:3000,resets:1});
 await transaction(db,async()=>{await m.record(7,17000,{...context,mode:'post-mainline'},{kind:'pour',completion:'solved'});await m.prune(100,40*86400000);});
 assert.equal(db.getFirstSync<{summary:string}>("SELECT summary FROM metric_firsts WHERE mode='mainline'")!.summary,fact);
 assert.equal(db.getFirstSync<{n:number}>("SELECT COUNT(*) n FROM metric_runs WHERE mode='mainline'")!.n,0);
 assert.equal(db.getFirstSync<{value:number}>("SELECT value FROM metric_summary WHERE mode='mainline' AND metric='completed_foreground_ms_sum'")!.value,3000);
 db.native.close();
});

test('abrupt process gaps mark partial; repeated request callbacks count once and do not imply executed assistance',async()=>{
 const {db,player}=await setup();const m=player.metrics;
 await transaction(db,async()=>{await m.record(1,10000,context,{kind:'show'});await m.record(2,11000,context,{kind:'hint-request',requestId:'r'});await m.record(3,12000,context,{kind:'hint-result',requestId:'r',result:'unknown'});await m.record(4,13000,context,{kind:'hint-result',requestId:'r',result:'unknown'});await m.initialize(14000);});
 const row=db.getFirstSync<{partial:number;totals:string;flags:string}>('SELECT * FROM metric_runs')!;
 assert.equal(row.partial,1);assert.equal(JSON.parse(row.totals).search_unknown,1);assert.equal(JSON.parse(row.totals).hint_requests,1);assert.equal(JSON.parse(row.flags).hint,false);
 db.native.close();
});

test('memory first exposure and answer remain unique after completion undo; repeated puzzle is distinct',async()=>{
 const {db,player}=await setup(); const memory=await MemoryRepository.open(player,content);
 let s=memory.start();await memory.commit(s,'show');s=readyMemory(s);await memory.commit(s,'ready');
 for(const p of s.puzzle.solution){s=moveMemory(s,p.source,p.target)!.session;await memory.commit(s,'pour');}
 const fact=db.getFirstSync<{summary:string}>("SELECT summary FROM metric_firsts WHERE mode='memory'")!.summary;
 s=undoMemory(s);await memory.commit(s,'undo');const p=s.puzzle.solution.at(-1)!;s=moveMemory(s,p.source,p.target)!.session;await memory.commit(s,'pour');
 assert.equal(db.getFirstSync<{n:number}>("SELECT COUNT(*) n FROM metric_runs WHERE mode='memory' AND result='remembered'")!.n,1);
 assert.equal(db.getFirstSync<{summary:string}>("SELECT summary FROM metric_firsts WHERE mode='memory'")!.summary,fact);
 s=resetMemory(s);await memory.commit(s,'reset');s=readyMemory(s);await memory.commit(s,'ready');for(const p of s.puzzle.solution){s=moveMemory(s,p.source,p.target)!.session;await memory.commit(s,'pour');}
 assert.equal(db.getFirstSync<{value:number}>("SELECT SUM(value) value FROM metric_summary WHERE metric='first_answer_correct'")!.value,1);
 assert.equal(db.getFirstSync<{value:number}>("SELECT SUM(value) value FROM metric_summary WHERE metric='repeat_answer_correct'")!.value,1);
 db.native.close();
});

test('monotonic intervals split at midnight and retain phase/timezone through wall clock changes',()=>{
 const midnight=Date.parse('2026-10-09T00:00:00Z');
 assert.deepEqual(splitLocalDays({endAt:midnight+5000,durationMs:10000,offset:0,phase:'play',blocked:false}).map(x=>[x.day,x.durationMs]),[['2026-10-08',5000],['2026-10-09',5000]]);
 const c=new MetricClock(0,midnight-5000,0);c.update(0,true,false,'observe',midnight-5000,0);c.update(10000,true,true,'peek',midnight-100000,60);c.update(12000,false,false,'play',midnight,0);
 const slices=c.take(13000);assert.equal(slices.reduce((n,x)=>n+x.durationMs,0),12000);assert.equal(slices[0].phase,'observe');assert.equal(slices[1].offset,60);assert.equal(slices[1].blocked,true);
});

test('outbox records only enabled facts; bounded retry, epoch and opt-out preserve local summaries',async()=>{
 const {db,player}=await setup();let fail=true;const sent:string[]=[];let enabled=false;
 const gateway:AnalyticsGateway={configure:async(value)=>{enabled=value;return true;},reset:async()=>{},logEvent:async(name)=>{if(fail)throw Error('offline');assert.equal(enabled,true);sent.push(name);}};
 await player.setPreference('analytics','false');
 const delivery=new AnalyticsDelivery(player,gateway,'test');await delivery.initialize();
 await player.record({type:'show'});assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_outbox')!.n,0);
 assert.equal(await delivery.setEnabled(true),true);await delivery.flush();
 await player.record({type:'clock'});await player.enqueueWrite(rev=>player.metrics.emit(rev,Date.now(),'bh_quality',{result:'test'}));await delivery.flush();
 assert.ok(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_outbox')!.n>0);
 fail=false;await delivery.flush();assert.ok(sent.includes('bh_quality'));
 await delivery.setEnabled(false);await delivery.flush();assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_outbox')!.n,0);assert.equal(enabled,false);
 assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_firsts')!.n,1);
 db.native.close();
});

test('fresh installs collect without a prompt; saved opt-out survives reopening and local facts continue',async()=>{
 const {db,player}=await setup();const sent:string[]=[];const configured:boolean[]=[];
 const gateway:AnalyticsGateway={configure:async(value)=>{configured.push(value);return true;},reset:async()=>{},logEvent:async(name)=>{sent.push(name);}};
 assert.equal(player.preference('analytics'),'true');
 const delivery=new AnalyticsDelivery(player,gateway,'test');await delivery.initialize();
 await player.enqueueWrite(rev=>player.metrics.session(rev,Date.now(),'ready'));await delivery.flush();
 assert.ok(sent.includes('bh_app_ready'));assert.deepEqual(configured,[true]);
 assert.equal(await delivery.setEnabled(false),true);
 const reopened=await PlayerRepository.open(db,content.mainline,content.sides,'test');
 assert.equal(reopened.preference('analytics'),'false');
 const count=sent.length;const next=new AnalyticsDelivery(reopened,gateway,'test');await next.initialize();
 await reopened.record({type:'show'});await next.flush();
 assert.equal(configured.at(-1),false);assert.equal(sent.length,count);
 assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_outbox')!.n,0);
 assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_firsts')!.n,1);
 db.native.close();
});

test('offline environments retain local facts without outbox entries or historical backfill',async()=>{
 const {db,player}=await setup();const m=player.metrics;
 await db.runAsync("UPDATE metadata SET value='offline' WHERE key='analytics-environment'");
 await transaction(db,()=>m.record(1,10000,context,{kind:'show'}));
 assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_firsts')!.n,1);
 assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_outbox')!.n,0);
 const sent:string[]=[];
 const delivery=new AnalyticsDelivery(player,{configure:async()=>true,reset:async()=>{},logEvent:async(name)=>{sent.push(name);}},'production');
 await delivery.initialize();await delivery.flush();assert.deepEqual(sent,[]);
 await player.enqueueWrite(rev=>m.emit(rev,Date.now(),'bh_quality',{result:'new'}));await delivery.flush();
 assert.deepEqual(sent,['bh_quality']);db.native.close();
});

test('full completion payloads respect GA4 limits and award/spend events do not double count',async()=>{
 const {db,player}=await setup();await player.setPreference('analytics','true');
 const c={...context,attributes:{colors:11,stage:20,tier:'D4',wave_role:'main-peak'}};
 await transaction(db,async()=>{
  await player.metrics.record(100,10000,c,{kind:'show'});
  await player.metrics.record(101,11000,c,{kind:'hint-request',requestId:'full'});
  await player.metrics.record(102,12000,c,{kind:'hint-result',requestId:'full',result:'unknown',durationMs:1000});
  await player.metrics.record(103,13000,c,{kind:'pour',hinted:true,requestId:'full',totals:{pours:1,hint_pours:1,credits_spent:1,credits_expected:2,credits_awarded:1,credits_capped:1,foreground_ms:3000,blocked_ms:1000,available_ms:2000},completion:'solved'});
 });
 const events=db.getAllSync<{name:Parameters<typeof validateParameters>[0];params:string}>('SELECT name,params FROM metric_outbox');
 for(const e of events){const p=JSON.parse(e.params);validateParameters(e.name,p);assert.match(p.event_id,/^[a-f0-9]{32}$/);assert.notEqual(p.event_id,player.installation);}
 assert.equal(JSON.parse(events.find(e=>e.name==='bh_credit_spend')!.params).credits_spent,1);
 assert.equal(JSON.parse(events.find(e=>e.name==='bh_credit_change')!.params).credits_spent,undefined);
 assert.equal(events.filter(e=>e.name==='bh_first_action').length,0);
 db.native.close();
});

test('outbox failure rolls back facts; ordered retry commits exactly one local observation',async()=>{
 const {db,player}=await setup();await player.setPreference('analytics','true');
 const before=db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_outbox')!.n;
 db.fail=sql=>sql.startsWith('INSERT OR IGNORE INTO metric_outbox');
 assert.equal(await player.enqueueWrite(rev=>player.metrics.record(rev,10000,context,{kind:'show'})),false);
 assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_firsts')!.n,0);
 assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_outbox')!.n,before);
 db.fail=null;assert.equal(await player.flush(),true);
 assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_firsts')!.n,1);
 const after=db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_outbox')!.n;
 await player.flush();assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_outbox')!.n,after);
 db.native.close();
});

test('cohort days use activation offset when the local date moves backwards during travel',async()=>{
 const {db,player}=await setup(),day=Date.parse('2026-10-01T00:00:00Z');
 await transaction(db,async()=>{
  await player.metrics.record(1,day+18*3600000,context,{kind:'show'});
  await player.metrics.record(2,day+18*3600000,context,{kind:'clock',slices:[{endAt:day+18*3600000,durationMs:10000,offset:0,phase:'play',blocked:false}]});
  await player.metrics.record(3,day+25*3600000,context,{kind:'clock',slices:[{endAt:day+25*3600000,durationMs:10000,offset:-600,phase:'play',blocked:false}]});
 });
 const days=db.getAllSync<{day:string}>("SELECT day FROM metric_days WHERE metric='cohort-active' ORDER BY day").map(x=>x.day);
 assert.deepEqual(days,['2026-10-01','2026-10-02']);
 const report=localAnalyticsReport(db,day+3*86400000);
 assert.equal(report.retention.find(x=>x.target===1)!.rate,1);
 assert.equal(report.retention.find(x=>x.target===7)!.rate,null);
 db.native.close();
});

test('completion denominator excludes immature and partial experiences and preserves unfinished challenges',async()=>{
 const {db,player}=await setup(),day=Date.parse('2026-10-01T00:00:00Z');
 await transaction(db,async()=>{
  let revision=100;
  for(const [id,at]of [['complete',day],['unfinished',day],['partial',day],['immature',day+7*86400000]] as const){const c={...context,slot:id,levelId:id};await player.metrics.record(revision++,at,c,{kind:'show'});if(id==='complete')await player.metrics.record(revision++,at+1000,c,{kind:'pour',completion:'solved'});}
  await db.runAsync("UPDATE metric_firsts SET summary=? WHERE level_id='partial'",JSON.stringify({partial:true}));
 });
 const row=localAnalyticsReport(db,day+8*86400000).completion[0];
 assert.deepEqual([row.entered,row.mature,row.eligible,row.withinWindow,row.partial,row.unmatured,row.rate],[4,3,2,1,1,1,.5]);
 assert.equal(localAnalyticsReport(db,day).completion[0].rate,null);
 db.native.close();
});

test('disabling during an SDK call stops subsequent dispatch and clears the collection epoch queue',async()=>{
 const {db,player}=await setup();let release:(()=>void)|undefined;let started:(()=>void)|undefined;
 const began=new Promise<void>(resolve=>{started=resolve;});const barrier=new Promise<void>(resolve=>{release=resolve;});let calls=0;
 const gateway:AnalyticsGateway={configure:async()=>true,reset:async()=>{},logEvent:async()=>{calls++;started!();await barrier;}};
 const delivery=new AnalyticsDelivery(player,gateway,'test');await delivery.initialize();
 await delivery.setEnabled(true);await began;
 await player.enqueueWrite(rev=>player.metrics.emit(rev,Date.now(),'bh_quality',{result:'queued'}));
 assert.equal(await delivery.setEnabled(false),true);release!();await delivery.flush();
 assert.equal(calls,1);assert.equal(db.getFirstSync<{n:number}>('SELECT COUNT(*) n FROM metric_outbox')!.n,0);
 assert.equal(player.preference('analytics'),'false');db.native.close();
});
