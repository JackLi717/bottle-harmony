import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { completeTwoKeyHints } from './lib/unlockTwoKeyCompleteHints.ts';
import { projectTwoKeyBank, TWO_KEY_RECIPE, type TwoKeyRecord } from './lib/unlockTwoKeyGeneration.ts';
import { sha256 } from './lib/unlockRatingEvidence.ts';
const args=process.argv.slice(2);assert.ok(args.length===0||args.length===2&&args[0]==='--out');
const output=resolve(args[1]??'builds/unlock-two-key-six'),root=resolve('builds');assert.ok(relative(root,output)&&!relative(root,output).startsWith(`..${sep}`)&&relative(root,output)!=='..');
const checkpoint=JSON.parse(readFileSync(`${output}/checkpoint.json`,'utf8'));assert.deepEqual(checkpoint.recipe,TWO_KEY_RECIPE);
const records=checkpoint.records as TwoKeyRecord[],bank=projectTwoKeyBank(records),verified=JSON.parse(readFileSync(`${output}/verification.json`,'utf8'));
assert.equal(verified.status,'pass');assert.equal(verified.bankEvidenceSha256,bank.evidenceSha256);
assert.equal(verified.checks.length,records.length);verified.checks.forEach((c:{evidenceSha256:string},i:number)=>assert.equal(c.evidenceSha256,sha256(records[i])));
const lock=`${output}/hints.lock`,fd=openSync(lock,'wx');
const workers=Array.from({length:3},()=>new Worker(new URL('./lib/unlockTwoKeyHintWorker.ts',import.meta.url)));
const evaluate=(worker:Worker,record:TwoKeyRecord)=>new Promise<ReturnType<typeof completeTwoKeyHints>>((done,reject)=>{
 const cleanup=()=>{worker.off('message',received);worker.off('error',failed);worker.off('exit',exited);};
 const failed=(e:Error)=>{cleanup();reject(e);},exited=(code:number)=>failed(Error(`Hint worker exited ${code}`));
 const received=(row:{result?:ReturnType<typeof completeTwoKeyHints>;error?:string})=>{cleanup();if(row.error)reject(Error(row.error));else {assert.ok(row.result);done(row.result);}};
 worker.once('message',received);worker.once('error',failed);worker.once('exit',exited);worker.postMessage({record,output});
});
const tables:Record<string,unknown>={},checks:ReturnType<typeof completeTwoKeyHints>['check'][]=[];
try {
 for(let i=0;i<records.length;i+=workers.length){
  const chunk=records.slice(i,i+workers.length),results=await Promise.all(chunk.map((r,j)=>evaluate(workers[j],r)));
  results.forEach((result,j)=>{tables[chunk[j].puzzle.id]=result.table;checks.push(result.check);console.log(`Hints ${i+j+1}/6 complete`);});
 }
}finally{await Promise.all(workers.map(w=>w.terminate()));closeSync(fd);unlinkSync(lock);}
const payload={method:'sequential-two-key-complete-hints-v1',bankEvidenceSha256:bank.evidenceSha256,tables};
writeFileSync(`${output}/hints.json`,JSON.stringify({...payload,evidenceSha256:sha256(payload)})+'\n');
writeFileSync(`${output}/hint-verification.json`,JSON.stringify({status:'pass',bankEvidenceSha256:bank.evidenceSha256,checks})+'\n');
console.log('Complete two-key hint bank ready');
