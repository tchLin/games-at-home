import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, nextRound, encore, resolve, chainMasks, other, previousPlayer } from '../src/engine.js';
import { DEFAULT_SETTINGS } from '../src/content.js';
import { settleParty, partyHint, judgePartyReverse, nextSubmission, nextListen } from '../src/party.js';
import { members, everyoneReady } from '../src/players.js';
const players = ['a','b','c','d','e'];
const game = (type) => newGame({ ...DEFAULT_SETTINGS, game: type, rounds: 5, timer: 30, wordCount: 3 }, players, 'group');
const secret = (s, extra = {}) => ({ gameId: s.id, round: s.round, word: 'banana', target: 50, ...extra });
const answer = (value, hint = 0) => ({ entries: { 0: { value, hint } } });
test('five-player roles rotate around the room and encore starts the next giver', () => {
  let s = game('wheel');
  for (const p of players) { assert.equal(s.giver,p); if (p !== 'e') s=nextRound({...s,phase:'reveal'}); }
  assert.equal(encore({...s,phase:'reveal'}, 'extra').giver,'a');
  assert.equal(other(s,'e'),'a'); assert.equal(previousPlayer(s,'a'),'e');
  assert.equal(members({host:'a',guest:'b',guest2:'c'}).length,3);
  assert.equal(everyoneReady({meta:{host:'a',guest:'b',guest2:'c'},ready:{b:1,c:0}}),false);
});
test('wheel waits for all independent guesses and awards individual scores once', () => {
  const s = {...game('wheel'),phase:'guess'};
  const records = {b:answer(50),c:answer(53),d:answer(80)};
  assert.equal(settleParty(s,secret(s),records,0),null);
  records.e=answer(48);
  const result=settleParty(s,secret(s),records,0);
  assert.equal(result.phase,'reveal'); assert.equal(result.scores.a,0); assert.equal(result.scores.b,4);assert.equal(result.scores.d,0);
  assert.equal(result.results.e.guess,48); assert.equal(result.result.target,50);
  assert.equal(settleParty(result,secret(s),records),null);
  const timed=settleParty({...s,deadline:10},secret(s),{b:answer(50)},11);
  assert.equal(timed.results.e.guess,-1); assert.equal(timed.scores.b,4);
});
test('each clue guesser gets separate guesses; solved players finish while others progress through hints', () => {
  let s = partyHint({...game('clues'),phase:'hint'},'yellow',0);
  const records={b:answer('banana',1),c:answer('lemon',1),d:answer('pear',1),e:answer('orange',1)};
  s=settleParty(s,secret(s),records,1);
  assert.equal(s.progress.b.done,true); assert.equal(s.scores.b,3); assert.equal(s.phase,'guess');
  for (const p of ['c','d','e']) records[p].entries[1]={value:'apple',hint:1};
  s=settleParty(s,secret(s),records,2); assert.equal(s.phase,'hint');assert.equal(s.progress.c.count,2);
  s=partyHint(s,'peel',3);
  assert.equal(s.progress.b.done,true);assert.equal(s.progress.c.used,0);
  records.c.entries[2]={value:'banana',hint:2};
  s=settleParty(s,secret(s),records,4);assert.equal(s.scores.c,2);
  s=settleParty(s,secret(s),records,40000);assert.equal(s.phase,'hint');
  s=partyHint(s,'monkey',40001);
  s=settleParty(s,secret(s),records,80000);assert.equal(s.phase,'reveal');
  assert.equal(s.scores.b,3);assert.equal(s.scores.c,2);assert.equal(s.scores.e,0);
  assert.equal(s.results.c.attempts.length,3);
});
test('audio exact matches resolve independently; spelling variants need individual verdicts', () => {
  let s={...game('reverse'),phase:'guess',deadline:100};
  const records={b:answer(' BANANA '),c:answer('bananna'),d:answer('apple'),e:null};
  s=settleParty(s,secret(s),records,1);
  assert.equal(s.progress.b.done,true);assert.equal(s.scores.b,1);assert.equal(s.progress.c.done,false);
  assert.equal(judgePartyReverse(s,secret(s),{c:records.c},'c',true),null, 'manual verdict waits for all histories after reconnect');
  s=judgePartyReverse(s,secret(s),records,'c',true);
  assert.equal(s.progress.c.done,true);assert.equal(s.phase,'guess');
  assert.equal(judgePartyReverse(s,secret(s),records,'c',true),null);
  s=settleParty(s,secret(s),records,101);assert.equal(s.progress.e.done,true);assert.equal(s.progress.d.done,false);
  s=judgePartyReverse(s,secret(s),records,'d',false);
  assert.equal(s.phase,'reveal');assert.equal(s.scores.c,1);assert.equal(s.scores.d,0);
  const skipped=judgePartyReverse({...game('reverse'),phase:'recording'},secret(game('reverse')),{},'a',false,true);
  assert.equal(skipped.phase,'reveal');assert.ok(Object.values(skipped.scores).every((v)=>v===0));
});
test('per-player submissions and listens survive reconnects without overwrites', () => {
  const s={...game('reverse'),phase:'guess'};
  const submitted=nextSubmission(null,s,'b','banana');
  assert.equal(nextSubmission(submitted,s,'b','apple'),undefined);
  assert.equal(nextSubmission(null,s,'a','banana'),undefined);
  let record=submitted;
  for(let i=1;i<=3;i++){record=nextListen(record);assert.equal(record.plays,i);}
  assert.equal(nextListen(record),undefined);assert.equal(record.entries[0].value,'banana');
});
test('five-player word race assigns unique chains and passes turns in a circle', () => {
  let s={...game('chain'),phase:'guess',boards:Object.fromEntries(players.map((p)=>[p,{masks:chainMasks(['coffee','shop','window'])}]))};
  for(const actor of players){
    assert.equal(s.turn,actor);
    const owner=other(s,actor);
    s=resolve({...s,phase:'pending',pending:{actor,kind:'guess',value:'wrong',index:0}},secret(s,{words:['coffee','shop','window']}));
    assert.equal(s.boards[owner].guesses[0][0].guess,'wrong');
  }
  assert.equal(s.turn,'a');
  for(let index=0;index<3;index++)s=resolve({...s,phase:'pending',pending:{actor:'a',kind:'guess',value:['coffee','shop','window'][index],index}},secret(s,{words:['coffee','shop','window']}));
  assert.equal(s.winner,'a');assert.equal(s.phase,'finished');assert.equal(s.scores.a,3);
});
