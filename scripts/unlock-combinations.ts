import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {COMBINATION_RECIPE,evaluateCombinationCandidate,combinationDiversity,projectCombinationBank,type CombinationRecord} from './lib/combinationGeneration.ts';
const args=process.argv.slice(2),command=args.shift()??'generate';assert.ok(['generate','verify'].includes(command));
for(let i=0;i<args.length;i+=2)assert.ok(['--out','--limit'].includes(args[i])&&args[i+1]&&!args.slice(0,i).includes(args[i]));
const option=(key:string,fallback:string)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const out=resolve(option('--out','builds/combined-six')),rel=relative(resolve('builds'),out);assert.ok(rel&&rel!=='..'&&!rel.startsWith(`..${sep}`)&&!rel.startsWith(sep));
const limit=Number(option('--limit',String(COMBINATION_RECIPE.maxCandidates)));assert.ok(Number.isSafeInteger(limit)&&limit>0&&limit<=COMBINATION_RECIPE.maxCandidates);
mkdirSync(out,{recursive:true});const records:CombinationRecord[]=[];
for(let number=1;number<=6;number++) {
  const file=`${out}/record-${number}.json`;
  if(command==='verify') {
    const old=JSON.parse(readFileSync(file,'utf8')) as CombinationRecord;
    const fresh=evaluateCombinationCandidate(number,old.source.origin.candidateIndex,console.log);assert.deepEqual(JSON.parse(JSON.stringify(fresh)),old);records.push(fresh!);
  } else {
    const cached=existsSync(file)?JSON.parse(readFileSync(file,'utf8')) as CombinationRecord:null;
    if(cached){assert.equal(cached.number,number);records.push(cached);continue;}
    for(let index=0;index<limit;index++) {
      const r=evaluateCombinationCandidate(number,index,console.log);if(!r||combinationDiversity([...records,r]).status!=='pass')continue;
      records.push(r);writeFileSync(file,JSON.stringify(r)+'\n');console.log(`accepted ${number}/6`);break;
    }
    assert.equal(records.length,number,`No verified candidate for ${number}; no playable export`);
  }
}
const bank=projectCombinationBank(records);writeFileSync(`${out}/play.json`,JSON.stringify(bank)+'\n');
writeFileSync(`${out}/verification.json`,JSON.stringify({status:'pass',mode:command,bankEvidenceSha256:bank.evidenceSha256,diversity:bank.diversity,checks:bank.entries.map(r=>({number:r.number,acceptance:r.acceptance,hints:r.hintClosure}))})+'\n');
writeFileSync(`${out}/report.md`,'# 三种组合内部六题\n\n完整经典底题→机关覆盖→原规则自动验收→完整公开提示闭包。每种两道，体验形式，目标 1–7 档；正式内容与玩家数据不动。\n\n| 题 | 组合 | 瓶／色 | 档位 | 分段 | 隐藏世界 | 提示闭包 |\n| --- | --- | --- | --- | --- | --- | --- |\n'+bank.entries.map(r=>`| ${r.number} | ${r.kind} | ${r.puzzle.containers.length}／${r.puzzle.colors.length} | ${r.rank} | ${r.stageRanks.join('/')} | ${r.acceptance.worlds} | ${r.hintClosure.closureStates} |`).join('\n')+'\n');
console.log(`Verified six combination puzzles: ${out}`);
