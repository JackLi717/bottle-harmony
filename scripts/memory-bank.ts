import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { ANCHORED_GENERATOR_ID, GENERATOR_ID, PRODUCTION_COLORS, makeCandidate, makeAnchoredCandidate, parseGeneratedContent, structureKey, contentMetrics } from '../src/game/generation.ts';
import { initialBoard } from '../src/game/model.ts';
import { applyPour, getLegalPours, type Pour } from '../src/game/rules.ts';
import { solveBoard } from '../src/game/solver.ts';
import { MEMORY_CATALOG } from '../src/game/memoryCatalog.ts';
import { MEMORY_RULES, validateMemoryPuzzle, type MemoryPuzzle } from '../src/game/memory.ts';
import { acceptsEvidence, analyzeMemory, decodeMemoryBank, memoryTargets, retainedPrototype, type MemoryBank, type MemoryRecord, type Target } from './memory-bank-lib.ts';

const mode = process.argv[2] ?? 'verify', path = process.argv[3] ?? 'assets/levels/memory-100.json';
if (mode !== 'build' && mode !== 'verify') throw new Error('Use memory:build or memory:verify');
const budget = { maxStates: 100000, maxMilliseconds: 30000 };
function alternative(puzzle: Pick<MemoryPuzzle,'level'|'solution'>): readonly Pour[] | null {
  const board = initialBoard(puzzle.level);
  for (const first of getLegalPours(board).filter(p => p.source !== puzzle.solution[0].source && p.target === puzzle.level.colors.length)) {
    const solved = solveBoard(applyPour(board,first),budget);
    if (solved.status === 'limitReached' && solved.reason === 'time') throw new Error('Alternative timed out; rerun with more time, never select by device speed');
    if (solved.status === 'solved') return [first,...solved.route];
  }
  return null;
}
function choose<T>(items: readonly T[], n: number): T[][] {
  if (!n) return [[]];
  return items.flatMap((item,i) => items.length-i>=n ? choose(items.slice(i+1),n-1).map(rest => [item,...rest]) : []);
}
function selectMasks(puzzle: MemoryPuzzle, target: Target, alt: readonly Pour[]) {
  // Rotate the deterministic enumeration so hidden locations are not always leftmost.
  const all = Array.from({ length:target.colors },(_,i)=>(i+target.number)%target.colors);
  for (const bottles of choose(all,target.bottles)) for (const doubled of choose(bottles,target.hidden-target.bottles)) {
    const masks = bottles.flatMap(b=>doubled.includes(b) ? [b*4,b*4+1] : [b*4]).sort((a,b)=>a-b);
    const p = { ...puzzle,masks };
    try { validateMemoryPuzzle(p); } catch { continue; }
    const evidence = analyzeMemory(p,alt);
    if (acceptsEvidence(target,evidence)) return { masks,evidence };
  }
  return null;
}
if (mode === 'build') {
  const records: MemoryRecord[] = [], keys = new Set<string>();
  // Reserve all retained structures before selecting new boards.
  for (const t of memoryTargets()) { const p=retainedPrototype(t.number); if(p) keys.add(structureKey(p.level)); }
  for (const target of memoryTargets()) {
    const retained = retainedPrototype(target.number);
    if (retained) {
      const solved=solveBoard(initialBoard(retained.level),budget); assert.equal(solved.status,'solved');
      if(solved.status!=='solved') throw new Error('Unverified retained board');
      const p={...retained,number:target.number,solution:solved.route}, alt=alternative(p);
      assert.ok(alt);
      records.push({...p,target,source:{prototype:p.level.id},alternative:alt,evidence:analyzeMemory(p,alt)});
    } else {
      let accepted: MemoryRecord | undefined;
      const previousPeak = records[Math.floor((target.number-1)/10)*10 + ((target.number-1)%10===6 ? 5 : -1)];
      const moveCap = target.role === 'recovery' && previousPeak && previousPeak.target.colors === target.colors
        ? previousPeak.solution.length : target.colors*4+2;
      const config={colors:PRODUCTION_COLORS.slice(0,target.colors),emptyBottles:2 as const,minSolutionMoves:1,maxSolutionMoves:moveCap,mixing:'relaxed' as const};
      for(let candidateIndex=0;candidateIndex<1000;candidateIndex++) {
        const seed=2026100800+target.number, anchored=target.number%2===0;
        const level=(anchored?makeAnchoredCandidate:makeCandidate)(seed,candidateIndex,config), key=structureKey(level);
        if(keys.has(key) || level.bottles.some(b=>level.colors.some(c=>b.layers.filter(v=>v===c).length>2))) continue;
        const solved=solveBoard(initialBoard(level),budget);
        if(solved.status==='limitReached' && solved.reason==='time') throw new Error(`Time budget at ${target.number}/${candidateIndex}; old output retained`);
        if(solved.status!=='solved' || solved.route.length>config.maxSolutionMoves) continue;
        const p={number:target.number,level,solution:solved.route,masks:[],skill:target.skill}, alt=alternative(p);
        if(!alt) continue;
        const selected=selectMasks(p,target,alt); if(!selected) continue;
        const source=parseGeneratedContent({format:'bottle-harmony-content',version:1,origin:{generator:anchored?ANCHORED_GENERATOR_ID:GENERATOR_ID,seed,candidateIndex,config},level,structureKey:key,solution:solved.route,metrics:contentMetrics(level,solved.route.length)});
        accepted={...p,...selected,target,source,alternative:alt}; keys.add(key); break;
      }
      assert.ok(accepted,`No validated candidate for ${target.number}; old output retained`); records.push(accepted);
    }
    const p=records.at(-1)!;
    console.log(`${p.number}: ${p.target.role} M${p.target.grade} C${p.target.colors} H${p.masks.length} ${p.solution.length} moves`);
  }
  const bank: MemoryBank={id:MEMORY_CATALOG,rules:MEMORY_RULES,recipe:'memory-ten-wave-v1',records};
  decodeMemoryBank(bank);
  mkdirSync(dirname(path),{recursive:true}); writeFileSync(`${path}.tmp`,JSON.stringify(bank));
  decodeMemoryBank(JSON.parse(readFileSync(`${path}.tmp`,'utf8'))); renameSync(`${path}.tmp`,path);
}
const bank=decodeMemoryBank(JSON.parse(readFileSync(path,'utf8')));
if (mode === 'verify') for (const p of bank.records) {
  const solved = solveBoard(initialBoard(p.level), budget);
  assert.equal(solved.status, 'solved', `Independent solve ${p.number}`);
  if (solved.status === 'solved') assert.equal(solved.route.length, p.solution.length);
}
const report={id:bank.id,count:bank.records.length,physicalStructures:bank.records.length,maskStructures:new Set(bank.records.map(p=>p.evidence.maskStructureKey)).size,
  grades:bank.records.reduce<Record<string,number>>((r,p)=>(r[`M${p.target.grade}`]=(r[`M${p.target.grade}`]??0)+1,r),{}),
  units:Array.from({length:10},(_,i)=>{const ps=bank.records.slice(i*10,(i+1)*10);return {from:i*10+1,to:(i+1)*10,colors:ps.map(p=>p.target.colors),hidden:ps.map(p=>p.target.hidden),moves:ps.map(p=>p.solution.length),meanReveal:ps.map(p=>p.evidence.reference.meanDelay)};}),
  records:bank.records.map((p,i)=>({id:p.level.id,...p.target,evidence:p.evidence,
    transition:i ? {colors:p.target.colors-bank.records[i-1].target.colors,hidden:p.target.hidden-bank.records[i-1].target.hidden,
      operations:p.solution.length-bank.records[i-1].solution.length,meanReveal:p.evidence.reference.meanDelay-bank.records[i-1].evidence.reference.meanDelay}:null}))};
mkdirSync('builds',{recursive:true});writeFileSync('builds/memory-100-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({verified:true,id:bank.id,count:bank.records.length,grades:report.grades,maskStructures:report.maskStructures,report:'builds/memory-100-report.json'}));
