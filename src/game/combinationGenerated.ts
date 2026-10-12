import {compileSortingPuzzle} from './engine.ts';
import {parseSortingPuzzle} from './engineModel.ts';
import {parseCombinationHints} from './combinationHints.ts';
import type {UnlockTrialLevel} from './unlockTrial.ts';

/** Lazy internal projection; no storage, wallet or progression imports. */
export function generatedCombinationTrials(input:unknown):readonly UnlockTrialLevel[] {
  const b=input as {format?:string;version?:number;method?:string;evidenceSha256?:string;entries?:unknown[]}|null;
  const fail=():never=>{throw Error('Invalid internal combination bank');};
  const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  if(!b||b.format!=='bottle-harmony-internal-combination-bank'||b.version!==1||b.method!=='classic-combination-six-v1'
    ||!hash(b.evidenceSha256)||!Array.isArray(b.entries)||b.entries.length!==6)return fail();
  const ids=new Set<string>(),roots=new Set<string>(),rows=new Set<string>(),opened=new Set<string>();
  const kinds=['key-cloth','key-cloth','key-reveal','key-reveal','two-key-reveal','two-key-reveal'];
  return Object.freeze(b.entries.map((entry,i)=>{
    const r=entry as {number?:number;kind?:string;puzzle?:unknown;hints?:unknown;sourceSha256?:string;classicStructureKey?:string;lowerRow?:string;openedStructure?:string;
      rank?:number;stageRanks?:number[];acceptance?:{method?:string;status?:string;label?:string;evidenceSha256?:string;worlds?:number;certificatesSha256?:string};hintClosure?:{method?:string;evidenceSha256?:string;closureStates?:number}};
    if(!r||r.number!==i+1||r.kind!==kinds[i]||!hash(r.sourceSha256)||!r.classicStructureKey||roots.has(r.classicStructureKey)
      ||!r.lowerRow||rows.has(r.lowerRow)||!r.openedStructure||opened.has(r.openedStructure)
      ||r.acceptance?.method!==`${r.kind}-automatic-acceptance-v1`||r.acceptance.status!=='pass'||r.acceptance.label!=='通过'
      ||!hash(r.acceptance.evidenceSha256)||!hash(r.acceptance.certificatesSha256)||!Number.isSafeInteger(r.acceptance.worlds)||r.acceptance.worlds!<1
      ||!Number.isSafeInteger(r.rank)||r.rank!<1||r.rank!>7||!Array.isArray(r.stageRanks)||!r.stageRanks.length
      ||r.stageRanks.some(n=>!Number.isSafeInteger(n)||n<1||n>7)||Math.max(...r.stageRanks)!==r.rank
      ||r.hintClosure?.method!=='combination-public-complete-hints-v1'||!hash(r.hintClosure.evidenceSha256)||!Number.isSafeInteger(r.hintClosure.closureStates)||r.hintClosure.closureStates!<1)return fail();
    const puzzle=parseSortingPuzzle(r.puzzle),rt=compileSortingPuzzle(puzzle),keys=puzzle.triggers.filter(t=>t.when.type==='empty'),covers=puzzle.triggers.filter(t=>t.when.type==='color-full');
    const targets=puzzle.triggers.flatMap(t=>t.unlock),row=Math.ceil(puzzle.containers.length/2);
    const corners=[0,row-1,row,puzzle.containers.length-1].map(i=>puzzle.containers[i].id);
    if(ids.has(puzzle.id)||puzzle.containers.length>12||puzzle.locked.length>Math.floor(puzzle.containers.length/2)
      ||keys.length!==(r.kind==='two-key-reveal'?2:1)||covers.length!==(r.kind==='key-cloth'?1:0)
      ||(r.kind==='key-cloth'?puzzle.hidden.length!==0:puzzle.hidden.length<1||puzzle.hidden.length>6)
      ||puzzle.containers.some(c=>c.capacity!==4||!c.canSource||!c.canReceive||c.fixed||c.receive!=='same'||c.acceptColors||c.protectedBottom)
      ||puzzle.amount!=='run'||puzzle.goal.type!=='sort'||puzzle.goal.containers.length!==puzzle.containers.length
      ||puzzle.colors.some(c=>puzzle.units.filter(u=>u.color===c).length!==4)
      ||targets.length!==puzzle.locked.length||new Set(targets).size!==targets.length||targets.some(id=>!puzzle.locked.includes(id))
      ||keys[0].when.type!=='empty'||puzzle.locked.includes(keys[0].when.container)
      ||keys.some(k=>{const when=k.when;return when.type==='empty'&&!puzzle.containers.find(c=>c.id===when.container)!.units.length;})
      ||r.kind==='two-key-reveal'&&(keys[1].when.type!=='empty'||!keys[0].unlock.includes(keys[1].when.container))
      ||r.kind==='key-cloth'&&(![10,12].includes(puzzle.containers.length)||covers[0].when.type!=='color-full'||covers[0].when.count!==4
        ||covers[0].unlock.length!==4||corners.some(id=>!covers[0].unlock.includes(id)))
      ||puzzle.containers.some(c=>puzzle.hidden.includes(c.units.at(-1)??'')||puzzle.locked.includes(c.id)&&c.units.some(id=>puzzle.hidden.includes(id))))return fail();
    ids.add(puzzle.id);roots.add(r.classicStructureKey);rows.add(r.lowerRow);opened.add(r.openedStructure);
    const title=r.kind==='key-cloth'?['钥匙与颜色盖布','Key and color covers'] as const:r.kind==='key-reveal'?['钥匙与逐层显色','Key and progressive reveal'] as const:['双钥匙与逐层显色','Two keys and progressive reveal'] as const;
    return Object.freeze({puzzle,title,focus:r.kind,introduction:r.kind==='key-cloth'
      ? ['先清空钥匙瓶腾出空间，再完成对应颜色揭布，整理全部液体。','Empty the key bottle to create space, finish the matching color to lift the cloths, then sort all liquid.'] as const
      : r.kind==='key-reveal'?['移走上层逐步显色，清空钥匙瓶开匣，再完成整理。','Expose hidden layers, empty the key bottle to open its box, then finish sorting.'] as const
        : ['逐步显色并依次取得两把钥匙，继续整理全盘液体。','Reveal the layers and acquire the two keys in order, then sort the whole board.'] as const,
      combinationHints:parseCombinationHints(r.hints,rt)});
  }));
}
