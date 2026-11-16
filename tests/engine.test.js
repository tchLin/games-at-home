import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, nextRound, normalize, resolve, maskWord, wheelPoints } from '../src/engine.js';
import { DEFAULT_SETTINGS } from '../src/content.js';
const create=(game,extra={})=>newGame({...DEFAULT_SETTINGS,game,...extra},['host','guest'],'game-test',1000);
test('wheel scores exact and nearby guesses, alternates roles, finishes at round limit',()=>{
  let s=create('wheel',{rounds:2});
  assert.equal(s.giver,'host');
  s={...s,phase:'pending',pending:{actor:'guest',kind:'guess',value:50}};
  s=resolve(s,{target:50},2000);assert.equal(s.scores.host,4);assert.equal(s.scores.guest,4);assert.equal(s.phase,'reveal');
  s=nextRound(s);assert.equal(s.giver,'guest');assert.equal(s.round,2);assert.equal(nextRound(s).phase,'finished');
  assert.equal(wheelPoints(50,60),3);assert.equal(wheelPoints(50,69),1);assert.equal(wheelPoints(50,90),0);
});
test('wheel timeout reveals the target without awarding points',()=>{
  const s={...create('wheel'),phase:'pending',pending:{actor:'guest',kind:'timeout'}};
  const next=resolve(s,{target:65});assert.equal(next.result.guess,-1);assert.equal(next.result.points,0);
});
test('word race: correct guesses retain the turn, wrong guesses and hints switch it',()=>{
  let s={...create('chain'),phase:'pending',turn:'host',boards:{guest:{masks:['c·····','p··','b··']},host:{masks:['a··','s··','m··']}}};
  const secret={words:['coffee','pie','bed']};
  s.pending={actor:'host',kind:'guess',value:'COFFEE',index:0};
  s=resolve(s,secret);assert.equal(s.turn,'host');assert.equal(s.scores.host,1);assert.equal(s.boards.guest.masks[0],'coffee');
  s={...s,phase:'pending',pending:{actor:'host',kind:'hint',index:1}};
  s=resolve(s,secret);assert.equal(s.turn,'guest');assert.equal(s.boards.guest.masks[1],'pi·');
  s={...s,turn:'host',phase:'pending',pending:{actor:'host',kind:'guess',value:'wrong',index:1}};
  s=resolve(s,secret);assert.equal(s.turn,'guest');assert.equal(s.scores.host,1);
});
test('last solved word ends the race; duplicate resolution is ignored',()=>{
  let s={...create('chain'),phase:'pending',turn:'host',scores:{host:2,guest:0},boards:{guest:{masks:['one','two','t····'],solved:{0:true,1:true}}},pending:{actor:'host',kind:'guess',value:'three',index:2}};
  s=resolve(s,{words:['one','two','three']});assert.equal(s.phase,'finished');assert.equal(s.winner,'host');assert.equal(resolve(s,{words:['one','two','three']}),null);
});
test('three clues allows configured guesses, advances hints, and reveals after the final miss',()=>{
  let s={...create('clues',{guessesPerHint:2}),phase:'pending',hintIndex:1,used:0,pending:{actor:'guest',kind:'guess',value:'wrong'}};
  s=resolve(s,{word:'coffee'});assert.equal(s.phase,'guess');assert.equal(s.used,1);
  s=resolve({...s,phase:'pending',pending:{actor:'guest',kind:'guess',value:'still wrong'}},{word:'coffee'});assert.equal(s.phase,'hint');
  s=resolve({...s,phase:'pending',hintIndex:3,pending:{actor:'guest',kind:'timeout'}},{word:'coffee'});assert.equal(s.phase,'reveal');assert.equal(s.result.word,'coffee');assert.equal(s.result.points,0);
});
test('three clues rewards early guesses and uses an authoritative next deadline',()=>{
  const s={...create('clues',{timer:30}),phase:'pending',hintIndex:2,used:0,pending:{actor:'guest',kind:'guess',value:'Café'}};
  const won=resolve(s,{word:'cafe'},10000);assert.equal(won.scores.guest,2);
  const missed=resolve(s,{word:'tea'},10000);assert.equal(missed.deadline,40000);
});
test('normalization and masking reveal only requested letters',()=>{
  assert.equal(normalize('  CAFÉ! '),'cafe');assert.equal(maskWord('coffee'),'c·····');assert.equal(maskWord('coffee',2),'co····');
});
