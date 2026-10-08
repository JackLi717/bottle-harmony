import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodeMemoryBank, analyzeMemory, prototypePositions } from '../scripts/memory-bank-lib.ts';
import { createMemory, readyMemory, moveMemory, hiddenMemory, undoMemory, restoreMemory, validateMemoryPuzzle } from '../src/game/memory.ts';
import { initialBoard } from '../src/game/model.ts';
import { replaySolution, solveBoard } from '../src/game/solver.ts';
import { nextMemoryNumber } from '../src/game/memoryCatalog.ts';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { MemoryRepository } from '../src/storage/memoryRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { TestDatabase } from './helpers/sqlite.ts';
import { MEMORY_PROTOTYPES } from '../scripts/memory-prototypes.ts';
const input = () => JSON.parse(readFileSync('assets/levels/memory-100.json','utf8'));
const bank = decodeMemoryBank(input());

test('hundred-puzzle source, two routes, masks, relations and ten-unit recipe are independently verifiable', () => {
  assert.equal(bank.records.length,100);
  const source = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(source);
  for (const p of bank.records) {
    assert.deepEqual(content.memoryPuzzle(p.number).level,p.level);
    assert.deepEqual(content.memoryPuzzle(p.number).masks,p.masks);
    assert.deepEqual(content.evidence(p.level.id),p);
    // Recompute the ordinary solve; neither stored route length nor a budget failure proves difficulty.
    const solved=solveBoard(initialBoard(p.level),{maxStates:100000,maxMilliseconds:30000});
    assert.equal(solved.status,'solved',`Unverified ${p.number}`);
    if(solved.status==='solved') assert.equal(solved.route.length,p.solution.length);
    replaySolution(initialBoard(p.level),p.alternative);
    assert.ok(p.evidence.lighterVariant.hidden<p.masks.length);
  }
  source.native.close();
});
test('both routes agree with runtime permanent knowledge, top-run visibility, undo and restore for every puzzle', () => {
  for(const p of bank.records) for(const [name,route] of [['reference',p.solution],['alternative',p.alternative]] as const) {
    let state=readyMemory(createMemory(p));
    assert.equal(hiddenMemory(state).flat().filter(Boolean).length,p.masks.length);
    route.forEach((q,i)=>{
      const before=state;
      state=moveMemory(state,q.source,q.target)!.session;
      const expected=p.evidence[name];
      assert.equal(hiddenMemory(state).flat().filter(Boolean).length,expected.remaining[i+1]);
      assert.deepEqual(p.masks.map(u=>state.revealed[u]),expected.first.map(n=>n<=i+1?n:-1));
      const undo=undoMemory(state);
      assert.deepEqual(undo.units,before.units); assert.deepEqual(undo.revealed,state.revealed);
    });
    assert.equal(state.game.status,'solved');
    assert.deepEqual(restoreMemory(p,{...state,offset:state.game.historyOffset}).revealed,state.revealed);
  }
});
test('catalog import rejects source/evidence/target corruption, masked top runs, orphan second layers and duplicate boards',()=>{
  for(const mutate of [
    (b: ReturnType<typeof input>)=>b.records[2].source.origin.seed++,
    (b: ReturnType<typeof input>)=>b.records[22].evidence.reference.first[0]++,
    (b: ReturnType<typeof input>)=>b.records[22].target.hidden++,
    (b: ReturnType<typeof input>)=>b.records[22].alternative=b.records[22].solution,
  ]) {const b=input(); mutate(b); assert.throws(()=>decodeMemoryBank(b));}
  const duplicate=input(), first=duplicate.records[10], second=duplicate.records[11];
  Object.assign(second,{level:first.level,source:first.source,solution:first.solution,alternative:first.alternative,masks:first.masks});
  second.evidence=analyzeMemory(second,second.alternative);
  assert.throws(()=>decodeMemoryBank(duplicate),/Duplicate board/);
  assert.throws(()=>validateMemoryPuzzle({...bank.records[0],masks:[1]}),/bottom mask/);
  assert.throws(()=>validateMemoryPuzzle({...bank.records[0],masks:[3]}),/mask|top run/i);
  assert.throws(()=>analyzeMemory({...bank.records[0],solution:[]},bank.records[0].alternative));
});
test('all five original boards restore by stable ID after renumbering, without changing tutorial, knowledge or mainline',async()=>{
  const source=new TestDatabase('assets/levels/content.sqlite'),content=new ContentRepository(source);
  for(const [number,index] of prototypePositions) {
    const old=MEMORY_PROTOTYPES[index-1],p=content.memoryPuzzle(number);
    assert.deepEqual(p.level,old.level); assert.deepEqual(p.masks,old.masks);
    const db=new TestDatabase(),player=await PlayerRepository.open(db,content.mainline,content.sides,'test');
    const repository=await MemoryRepository.open(player,content),main=player.state;
    let state=readyMemory(createMemory({...p,number:index}));
    const q=p.solution[0]; state=moveMemory(state,q.source,q.target)!.session;
    await repository.commit(state,'pour'); await repository.completeTutorial();
    const loaded=await MemoryRepository.open(player,content);
    assert.equal(loaded.state!.puzzle.number,number);
    assert.equal(loaded.state!.puzzle.level.id,old.level.id);
    assert.deepEqual(loaded.state!.units,state.units); assert.deepEqual(loaded.state!.revealed,state.revealed);
    assert.equal(loaded.state!.pours,1); assert.equal(loaded.tutorialDone,true); assert.equal(player.state,main);
    db.native.close();
  }
  source.native.close();
});
test('memory progression reaches 100 and restarts at one without a phantom 101',()=>{
  assert.equal(nextMemoryNumber(5),6); assert.equal(nextMemoryNumber(99),100); assert.equal(nextMemoryNumber(100),1);
  assert.throws(()=>nextMemoryNumber(101)); assert.throws(()=>nextMemoryNumber(0));
});
