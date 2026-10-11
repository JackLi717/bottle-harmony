import { parseSortingPuzzle } from './engineModel.ts';
import { compileSortingPuzzle } from './engine.ts';
import { parseTwoKeyHintTable } from './unlockTwoKeyHints.ts';
import type { UnlockTrialLevel } from './unlockTrial.ts';
/** Frozen internal projection only. No generation, rating, storage or progression on-device. */
export function generatedTwoKeyTrials(input: unknown, hints: unknown): readonly UnlockTrialLevel[] {
 const fail=():never=>{throw Error('Invalid internal two-key bank');};
 if(!input||typeof input!=='object')return fail();const bank=input as Record<string,unknown>;
 const recipe=bank.recipe as {count?:number;target?:{min?:number;max?:number};groupWidths?:unknown;integration?:string;diversity?:string}|null;
 const diversity=bank.diversity as {status?:string;roots?:number;rows?:number;finals?:number}|null;
 const hintBank=hints as {method?:string;bankEvidenceSha256?:string;tables?:Record<string,unknown>}|null;
 if(bank.format!=='bottle-harmony-internal-two-key-bank'||bank.version!==1||bank.method!=='classic-two-key-batch-v1'
  ||!Array.isArray(bank.entries)||bank.entries.length!==6||!/^[a-f0-9]{64}$/.test(String(bank.evidenceSha256))
  ||recipe?.count!==6||recipe.target?.min!==4||recipe.target.max!==6||JSON.stringify(recipe.groupWidths)!=='[1,1]'
  ||recipe.integration!=='each-opening-public-whole-board-v1'||recipe.diversity!=='unique-classic-lower-row-final-v1'
  ||diversity?.status!=='pass'||diversity.roots!==6||diversity.rows!==6||diversity.finals!==6
  ||hintBank?.method!=='sequential-two-key-complete-hints-v1'||hintBank.bankEvidenceSha256!==bank.evidenceSha256
  ||!hintBank.tables||Object.keys(hintBank.tables).length!==6)return fail();
 const ids=new Set<string>(),roots=new Set<string>();
 return Object.freeze(bank.entries.map((entry,i)=>{
  const row=entry as {number?:number;puzzle?:unknown;rank?:number;stageRanks?:number[];classicStructureKey?:string;sourceSha256?:string;
   acceptance?:{status?:string;label?:string;evidenceSha256?:string};integration?:{method?:string;status?:string;openings?:{status?:string;sharedColors?:string[];connected?:boolean;linksPerBottle?:number[]}[]}};
  const puzzle=parseSortingPuzzle(row.puzzle),runtime=compileSortingPuzzle(puzzle);
  const first=puzzle.triggers.find(t=>t.when.type==='empty'&&!puzzle.locked.includes(t.when.container)),second=puzzle.triggers.find(t=>t!==first);
  if(row.number!==i+1||!Number.isSafeInteger(row.rank)||row.rank!<4||row.rank!>6||!Array.isArray(row.stageRanks)||row.stageRanks.length!==3
   ||row.stageRanks.some((n,j)=>!Number.isSafeInteger(n)||n<(j<2?1:0)||n>7)||Math.max(...row.stageRanks)!==row.rank
   ||puzzle.triggers.length!==2||!first||!second||first.when.type!=='empty'||second.when.type!=='empty'
   ||first.unlock.length!==1||second.unlock.length!==1||first.unlock[0]!==second.when.container||first.unlock[0]===second.unlock[0]
   ||puzzle.locked.length!==2||puzzle.locked.some(id=>![...first.unlock,...second.unlock].includes(id))||puzzle.locked.length*2>puzzle.containers.length
   ||puzzle.containers.length>10||puzzle.hidden.length||puzzle.amount!=='run'||puzzle.goal.type!=='sort'||puzzle.goal.containers.length!==puzzle.containers.length
   ||puzzle.containers.some(c=>c.capacity!==4||!c.canSource||!c.canReceive||c.receive!=='same'||c.protectedBottom||c.acceptColors)
   ||puzzle.colors.some(c=>puzzle.units.filter(u=>u.color===c).length!==4)
   ||[first,second].some(t=>{const when=t.when;return when.type!=='empty'||!puzzle.containers.find(c=>c.id===when.container)?.units.length;})
   ||puzzle.locked.some(id=>puzzle.containers.find(c=>c.id===id)!.units.length!==4)
   ||row.acceptance?.status!=='pass'||row.acceptance.label!=='通过'||!/^[a-f0-9]{64}$/.test(String(row.acceptance.evidenceSha256))
   ||!/^[a-f0-9]{64}$/.test(String(row.sourceSha256))||typeof row.classicStructureKey!=='string'||roots.has(row.classicStructureKey)||ids.has(puzzle.id)
   ||!row.integration||row.integration.method!==recipe.integration||row.integration.status!=='pass'||row.integration.openings?.length!==2
   ||row.integration.openings.some(o=>o.status!=='pass'||o.connected!==true||!Array.isArray(o.sharedColors)||o.sharedColors.length<3
    ||!Array.isArray(o.linksPerBottle)||o.linksPerBottle.length!==1||o.linksPerBottle[0]<2))return fail();
  ids.add(puzzle.id);roots.add(row.classicStructureKey);
  return Object.freeze({puzzle,focus:'generated-two-key',title:['双钥匙','Two keys'] as const,
   introduction:['依次清空两只钥匙瓶，再完成全盘整理。可免费提示、撤销和重来。','Empty the two key bottles in order, then sort all liquid. Hints, undo and reset are free.'] as const,
   twoKeyHints:parseTwoKeyHintTable(hintBank.tables![puzzle.id],runtime)});
 }));
}
