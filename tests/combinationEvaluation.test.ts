import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { engineFixture } from '../src/game/engineExamples.ts';
import { UNLOCK_TRIAL } from '../src/game/unlockTrial.ts';
import { compileSortingPuzzle, initialEngineState, transitionEngine, visibleEngineState, evaluateEngineGoal, validateEngineState, type EngineFrame } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { COMBINATION_SAMPLES } from '../scripts/lib/combinationSamples.ts';
import { combinedInventoryWorlds } from '../scripts/lib/combinedInventoryWorlds.ts';
import { evaluateDisclosure, disclosureClassicReferences } from '../scripts/lib/disclosureAcceptance.ts';
import { disclosureProgress, analyzeDisclosureDifficulty } from '../scripts/lib/disclosureStageDifficulty.ts';
import { buildRatingGraph } from '../scripts/lib/unlockRatingGraph.ts';
import { DISCLOSURE_PROOF_BUDGET } from '../scripts/lib/disclosurePublicProof.ts';
import { auditProgressiveMasks } from '../scripts/lib/progressiveMaskTemplates.ts';
import { defaultCoverFamily, coverGroups } from '../src/art/unlockPresentation.ts';
import { boardLayout } from '../src/ui/boardLayout.ts';
import { sha256 } from '../scripts/lib/unlockRatingEvidence.ts';
import { auditUnlockClothTemplates } from '../scripts/lib/unlockClothTemplates.ts';

const target = { min: 1, max: 7 };
const results = COMBINATION_SAMPLES.map(s => evaluateDisclosure(s.puzzle, s.kind, { target }));

test('all three fixed combinations couple actual boundaries, preserve maximum stage rank and simple rhythm without scores', () => {
  for (const [i, { puzzle }] of COMBINATION_SAMPLES.entries()) {
    const result = results[i]; assert.equal(result.status, 'pass', JSON.stringify(result.reasons));
    const d = result.difficulty!; assert.equal(d.status, 'rated'); if (d.status !== 'rated') throw Error('Missing rating');
    assert.equal(d.rank, 1); assert.equal(d.rank, Math.max(...d.stageRanks)); assert.equal(result.rhythm?.status, 'pass');
    assert.ok(result.checks.every(c => c.status === 'pass')); assert.ok(!('score' in result));
    const runtime = compileSortingPuzzle(puzzle); let frame = initialEngineState(runtime), start = 0;
    for (const stage of d.witness.stages) {
      assert.equal(stage.startPour, start); let boundaries = 0;
      for (const a of d.witness.route.slice(start, stage.endPour)) {
        const n = transitionEngine(runtime, frame.state, frame.known, a); assert.ok(n.accepted);
        if (n.state.fired.length > frame.state.fired.length || n.known.length > frame.known.length) boundaries++;
        frame = { state: n.state, known: n.known };
      }
      assert.deepEqual(frame, stage.frame); assert.equal(boundaries, stage.goal === 'sort' ? 0 : 1); start = stage.endPour;
    }
    assert.equal(start, d.witness.route.length); assert.ok(evaluateEngineGoal(runtime, frame.state));
    const keys = puzzle.triggers.filter(t => t.when.type === 'empty').map(t => t.id);
    assert.deepEqual(d.witness.stages.flatMap(s => s.opened.filter(id => keys.includes(id))), keys);
    replayEngineRoute(runtime, initialEngineState(runtime), d.witness.route);
  }
});

test('joint enumeration varies both masked truth and concealed counts/orders, independently replays all worlds and automatic second keys', () => {
  let automaticSecond = false;
  for (const [i, { puzzle, kind }] of COMBINATION_SAMPLES.entries()) {
    const worlds = [...combinedInventoryWorlds(puzzle)], proof = results[i].publicInformation!;
    assert.equal(worlds.length, [70,4,25][i]); assert.equal(proof.worlds, worlds.length); assert.equal(proof.certificates.length, worlds.length);
    const rt = compileSortingPuzzle(puzzle), initial = initialEngineState(rt), counts = new Set<string>(), masks = new Set<string>();
    const historyActions = new Map<string, string>(), progresses = new Set<number>();
    for (const [j, w] of worlds.entries()) {
      validateEngineState(w.runtime, w.frame.state, w.frame.known);
      for (const color of puzzle.colors) assert.equal(w.runtime.puzzle.units.filter(u => u.color === color).length, 4);
      for (const id of initial.known) assert.equal(w.runtime.unitColors.get(id), rt.unitColors.get(id));
      counts.add(JSON.stringify(w.frame.state.contents.filter((_, n) => puzzle.locked.includes(puzzle.containers[n].id)).map(s => s.length)));
      masks.add(JSON.stringify(puzzle.hidden.map(id => w.runtime.unitColors.get(id))));
      progresses.add(disclosureProgress(w.runtime, w.frame, kind));
      let frame: EngineFrame = w.frame, transcript = '';
      for (const a of proof.certificates[j].route) {
        transcript += JSON.stringify(visibleEngineState(w.runtime, frame.state, frame.known));
        const old = historyActions.get(transcript); if (old) assert.equal(JSON.stringify(a), old); else historyActions.set(transcript, JSON.stringify(a));
        const next = transitionEngine(w.runtime, frame.state, frame.known, a); assert.ok(next.accepted);
        if (!frame.state.fired.includes('first') && next.state.fired.includes('first') && next.state.fired.includes('second')) automaticSecond = true;
        frame = next;
      }
      assert.ok(evaluateEngineGoal(w.runtime, frame.state)); replayEngineRoute(w.runtime, w.frame, proof.certificates[j].route);
    }
    assert.equal(progresses.size, 1, 'progress cannot consult the secret world');
    if (kind !== 'key-reveal') assert.ok(counts.size > 1, 'concealed bottle counts must not be copied from truth');
    if (kind.endsWith('reveal')) assert.ok(masks.size > 1, 'masked true colors must not restrict enumeration');
  }
  assert.ok(automaticSecond, 'An empty concealed second key must auto-fire after the first opens it');
});

test('cover geometry uses color cloth plus a wooden key shell, and masks recognize fixed sizes/continuous or interleaved lower shapes', () => {
  const p = COMBINATION_SAMPLES[0].puzzle, rt = compileSortingPuzzle(p), initial = initialEngineState(rt);
  assert.equal(defaultCoverFamily(p), 'cloth');
  const groups = coverGroups(p, visibleEngineState(rt, initial.state, initial.known), null, boardLayout(10).positions, defaultCoverFamily(p));
  assert.equal(groups.length, 5); assert.equal(results[0].presentation?.status, 'pass');
  assert.equal(auditUnlockClothTemplates(p, { mixedKeys: true }).geometry.groups.filter(g => g.template === 'cloth').length, 4);
  for (const { puzzle, kind } of COMBINATION_SAMPLES.slice(1)) {
    assert.equal(auditProgressiveMasks(puzzle).status, 'pass'); assert.equal(auditProgressiveMasks(puzzle).size, 'teaching');
    assert.ok(auditProgressiveMasks(puzzle).groups.every(g => g.pattern === 'continuous-bottom'));
    assert.equal(evaluateDisclosure({ ...puzzle, triggers: [...puzzle.triggers].reverse() }, kind, { target }).status, 'pass');
  }
  const interleaved = engineFixture('mask-variation', [['coral','jade','coral','jade'],['jade','coral','jade','coral'],[],[]], { hidden: [[0,0],[0,2],[1,1]] });
  assert.equal(auditProgressiveMasks(interleaved).status, 'pass'); assert.equal(auditProgressiveMasks(interleaved).size, 'standard');
  assert.ok(auditProgressiveMasks(interleaved).groups.some(g => g.pattern === 'interleaved-lower'));
  const bad = { ...interleaved, hidden: ['u0_0','u0_1','u0_2'] };
  assert.equal(auditProgressiveMasks(bad).status, 'fail');
});

test('a secretly supplied missing color can be truly solved but fails public combination acceptance', () => {
  const p = COMBINATION_SAMPLES[0].puzzle;
  const unsafe = { ...p, id: 'secret-missing-color', units: p.units.map(u => u.id === 'u6_3' ? { ...u, color: 'azure' } : u.id === 'u2_0' ? { ...u, color: 'coral' } : u) };
  const r = evaluateDisclosure(unsafe, 'key-cloth', { target });
  assert.equal(r.difficulty?.status, 'rated'); assert.equal(r.publicInformation?.status, 'fail'); assert.equal(r.status, 'fail');
  assert.ok(r.reasons.some(r => r.code === 'no-public-policy-for-coupled-route'));
});

test('hard cover/mask/rhythm failures override unknowns; unsupported parallel or three-way structures stay unknown', () => {
  const crowded = engineFixture('too-many-covers', [['jade'],['coral'],['coral','coral','coral'],['jade'],['jade'],[],[],['jade']], {
    locked: [0,3,4,5,7], triggers: [{ id:'key',when:{type:'empty',container:'b1'},unlock:['b5'] },{ id:'cloth',when:{type:'color-full',color:'coral',count:4},unlock:['b0','b3','b4','b7'] }],
  });
  const r = evaluateDisclosure(crowded, 'key-cloth', { target: null, maxStates: 1 }); assert.equal(r.status, 'fail'); assert.ok(r.reasons.some(r => r.code === 'cover-exceeds-half'));
  const badMask = engineFixture('mask-outside-template', [['coral','jade','coral','jade'],['jade','coral','jade'],['coral'],[],[]], {
    locked:[4],hidden:[[0,0],[0,1],[0,2]],triggers:[{id:'key',when:{type:'empty',container:'b0'},unlock:['b4']}],
  });
  const masked = evaluateDisclosure(badMask, 'key-reveal', { target:null,maxStates:1 });
  assert.equal(masked.status, 'fail'); assert.ok(masked.reasons.some(r => r.code === 'mask-template-fail'));
  const unordered = engineFixture('cloth-before-key', [['jade'],['amber'],[],['amber','amber','amber'],['jade'],['jade'],['coral'],['coral','coral','coral'],[],['jade']], {
    locked:[0,2,4,5,9],triggers:[{id:'key',when:{type:'empty',container:'b1'},unlock:['b2']},{id:'cloth',when:{type:'color-full',color:'coral',count:4},unlock:['b0','b4','b5','b9']}],
  });
  const order = evaluateDisclosure(unordered, 'key-cloth', { target,proofBudget:{...DISCLOSURE_PROOF_BUDGET,maxWorlds:1} });
  assert.equal(order.status, 'fail'); assert.ok(order.reasons.some(r => r.code === 'cloth-can-open-before-key'));
  const backloaded = engineFixture('backloaded-key-reveal', [['coral','jade'],['jade','jade'],['coral','coral'],['amber','coral'],['amber','jade','amber','amber'],[]], {
    locked:[3,4],hidden:[[0,0]],triggers:[{id:'first',when:{type:'empty',container:'b0'},unlock:['b3']},{id:'second',when:{type:'empty',container:'b3'},unlock:['b4']}],
  });
  const rhythm = evaluateDisclosure(backloaded, 'two-key-reveal', { target, proofBudget: { ...DISCLOSURE_PROOF_BUDGET, maxWorlds: 1 } });
  assert.equal(rhythm.status, 'fail'); assert.equal(rhythm.rhythm?.status, 'fail'); assert.equal(rhythm.publicInformation?.status, 'unknown');
  assert.ok(rhythm.reasons.some(r => r.code === 'rhythm-fail'));
  const p = COMBINATION_SAMPLES[2].puzzle;
  const parallel = { ...p, triggers: p.triggers.map((t,i) => i ? { ...t, when: { type:'empty' as const, container:'b1' } } : t) };
  assert.equal(evaluateDisclosure(parallel, 'two-key-reveal', { target }).status, 'unknown');
  assert.equal(evaluateDisclosure(UNLOCK_TRIAL[11].puzzle, 'key-reveal', { target }).status, 'unknown');
});

test('one move may fire the key and cover together; its actual boundary is recorded once', () => {
  const p = engineFixture('simultaneous-key-cloth', [['amber'],['jade'],['coral','coral','coral','coral'],['jade','jade','jade'],['amber'],['amber'],[],[],[],['amber']], {
    locked:[0,2,4,5,9],triggers:[{id:'key',when:{type:'empty',container:'b1'},unlock:['b2']},{id:'cloth',when:{type:'color-full',color:'coral',count:4},unlock:['b0','b4','b5','b9']}],
  });
  const d = analyzeDisclosureDifficulty(buildRatingGraph(p), 'key-cloth'); assert.equal(d.status, 'rated'); if (d.status !== 'rated') throw Error('Missing simultaneous witness');
  assert.deepEqual(d.witness.stages[0].opened, ['key','cloth'].sort());
  assert.equal(d.witness.stages[0].goal, 'acquire-key-and-open-cover'); assert.equal(d.witness.stages[0].endPour, 1);
});

test('missing targets and bounded computation cannot become a high grade or pass; references bind every combined certificate', () => {
  const { puzzle, kind } = COMBINATION_SAMPLES[1];
  for (const opts of [{ maxStates: 1 }, { maxEdges: 1 }, { maxWork: 1 }]) {
    const r = evaluateDisclosure(puzzle, kind, { target, ...opts }); assert.equal(r.status, 'unknown'); assert.equal(r.difficulty?.rank, null);
  }
  for (const override of [{maxWorlds:1},{maxPhaseStates:1},{maxTotalStates:1},{maxEdges:1},{maxMilliseconds:0.000001}]) {
    const r = evaluateDisclosure(puzzle, kind, { target, proofBudget: { ...DISCLOSURE_PROOF_BUDGET, ...override } });
    assert.equal(r.status, 'unknown'); assert.equal(r.publicInformation?.status, 'unknown');
  }
  assert.equal(evaluateDisclosure(puzzle, kind, { target:null }).status, 'unknown');
  assert.equal(evaluateDisclosure(puzzle, kind, { target:{min:4,max:6} }).status, 'fail');
  for (const [i, { puzzle }] of COMBINATION_SAMPLES.entries()) {
    const r = results[i], { method, definitionSha256, target, budgets, evidenceSha256, limits: _limits, ...evidence } = r;
    assert.equal(evidenceSha256, sha256({ binding:{method,definitionSha256,target,budgets},evidence }));
    const refs = disclosureClassicReferences(puzzle, r); assert.ok(refs.base.human?.score !== undefined);
    for (const s of refs.stages) if (s.goal !== 'sort') assert.equal(s.reference.status, 'not-applicable');
  }
});

test('combined CLI produces diagnostic reports only, and existing formal/internal content stays byte-identical', () => {
  const run = spawnSync(process.execPath, ['--experimental-strip-types','scripts/disclosure-rating.ts','--kind','combined','--min-rank','1','--max-rank','7','--max-states','1','--out','builds/combined-evaluation/cli-unknown']);
  assert.equal(run.status, 1, run.stderr.toString());
  const summary = JSON.parse(readFileSync('builds/combined-evaluation/cli-unknown/summary.json', 'utf8'));
  assert.equal(summary.rows.length, 3); assert.ok(summary.rows.every((r:{status:string}) => r.status === 'unknown'));
  for (const p of ['assets/levels/content.sqlite','assets/levels/mainline-catalog.json','assets/levels/mainline-play.json','assets/levels/solid-side-50.json','assets/levels/progressive-reveal-four.json','assets/levels/unlock-two-key-six.json']) {
    assert.ok(readFileSync(p).equals(execFileSync('git',['show','HEAD:'+p],{maxBuffer:64000000})));
  }
});
