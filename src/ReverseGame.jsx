import { useEffect, useRef, useState } from 'react';
import { Mic, Play, Square, Check, X } from 'lucide-react';
import { db, ref, set, get } from './firebase.js';
import { Button, Field, Tag, Notice } from './App.jsx';
import { deadline, judgeReverse } from './engine.js';
import { pronunciationUrl } from './reverse-words.js';
import { isExactReverseGuess } from './reverse-game.js';
import { RECORD_SECONDS, audioContext, decode, playBuffer, microphone, reverseWav, toBase64, fromBase64 } from './reverse-audio.js';
import { sounds } from './sound.js';

export default function ReverseGame({ room, s, secret, uid, name, disabled, mutate, act, now, base, send }) {
  const [guess, setGuess] = useState('');
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const resources = useRef({ alive: true });
  const giver = s.giver === uid;
  const audioPath = `roundAudio/${base.split('/')[1]}`;
  useEffect(() => {
    const r = resources.current;
    r.alive = true;
    const onVisibility = () => { if (document.visibilityState === 'hidden') r.mic?.stop(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      r.alive = false; r.stop?.(); r.mic?.cancel();
      clearInterval(r.timer); void r.context?.close(); sounds.setSuppressed(false);
    };
  }, []);
  useEffect(() => {
    if (!giver && s.phase !== 'guess') {
      resources.current.stop?.(); setPlaying(false);
    }
  }, [s.phase, giver]);
  const context = async () => {
    const r = resources.current;
    r.context ||= audioContext();
    await r.context.resume();
    return r.context;
  };
  const listen = (reference) => act(async () => {
    const r = resources.current;
    const ctx = await context(); // Unlock audio during the user gesture, before fetching.
    let buffer;
    if (reference) {
      if (!r.reference) {
        const response = await fetch(pronunciationUrl(secret.word));
        if (!response.ok) throw Error('Couldn’t load the pronunciation. Please try again.');
        r.reference = await decode(ctx, await response.arrayBuffer(), true);
      }
      buffer = r.reference;
    } else {
      if (!r.clip) {
        const clip = (await get(ref(db, audioPath))).val();
        if (clip?.gameId !== s.id || clip.round !== s.round) throw Error('The recording is not ready yet.');
        r.clip = await decode(ctx, fromBase64(clip.data));
      }
      buffer = r.clip;
      if (!r.alive) return;
      const claimed = await mutate((v) => v.id === s.id && v.round === s.round && v.phase === 'guess' && v.plays < 3
        ? { ...v, plays: v.plays + 1 } : null);
      if (!claimed) throw Error('No listens remain, or this turn has ended.');
    }
    if (!r.alive) return;
    r.stop?.(); setPlaying(true);
    r.stop = playBuffer(ctx, buffer, () => { if (r.alive) setPlaying(false); });
  });
  const record = () => {
    const clockOffset = now - Date.now();
    sounds.setSuppressed(true);
    resources.current.stop?.(); setPlaying(false);
    act(async () => {
      const r = resources.current;
      try {
        const ctx = await context();
        r.mic = await microphone();
        if (!r.alive) return;
        const claimed = await mutate((v) => v.id === s.id && v.round === s.round && v.phase === 'prepare' && !v.recorded && !v.pausedAt
          ? { ...v, recorded: true, phase: 'recording' } : null);
        if (!claimed || !r.alive) return;
        setRecording(true); setElapsed(0);
        const started = Date.now();
        r.timer = setInterval(() => setElapsed(Math.min(RECORD_SECONDS, Math.floor((Date.now() - started) / 1000))), 200);
        const blob = await r.mic.start();
        clearInterval(r.timer); setRecording(false); setProcessing(true);
        if (!r.alive) return;
        const buffer = await decode(ctx, await blob.arrayBuffer());
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
        const data = toBase64(reverseWav(channels, buffer.sampleRate));
        if (!r.alive) return;
        await set(ref(db, audioPath), { roomCode: room.meta.code, gameId: s.id, round: s.round, owner: uid, data });
        await mutate((v) => v.id === s.id && v.round === s.round && v.phase === 'recording' && !v.pausedAt
          ? { ...v, phase: 'guess', deadline: deadline(v, Date.now() + clockOffset) } : null);
      } catch (error) {
        if (error.name === 'NotAllowedError') throw Error('Allow microphone access in your browser to record. Your take has not been used.');
        throw error;
      } finally {
        clearInterval(r.timer); r.mic?.cancel(); r.mic = null; sounds.setSuppressed(false);
        if (r.alive) { setRecording(false); setProcessing(false); }
      }
    });
  };
  // An upload may have succeeded just before a disconnect. The owner can finish
  // that transition after rejoining, without recording or uploading again.
  const recover = () => act(async () => {
    const clip = (await get(ref(db, audioPath))).val();
    if (clip?.gameId !== s.id || clip.round !== s.round) throw Error('No saved recording. Use Skip round to continue.');
    await mutate((v) => v.phase === 'recording' ? { ...v, phase: 'guess', deadline: deadline(v, now) } : null, s);
  });
  const verdict = (pass, skip = false) => act(() => mutate((v) => judgeReverse(v, secret, pass, skip), s));
  const reveal = s.phase === 'reveal';
  const exact = isExactReverseGuess(s, secret);
  return <div className="reverse-game">
    <div className="stage-title">
      <Tag>{reveal ? 'THE WORD WAS…' : giver ? 'YOU’RE THE VOICE' : 'YOU’RE THE LISTENER'}</Tag>
      <h2>{reveal ? s.result.word : giver ? 'A word, turned around.' : 'Sounds almost familiar.'}</h2>
      <p>{reveal ? s.result.correct ? 'Pass! One point for the listener.' : 'No point this time. Swap roles next round.'
        : giver ? 'Listen to the backwards pronunciation. Imitate it in one recording; we’ll flip your voice for your person.'
        : `${name(s.giver)} is making a backwards recording. You get three listens and one guess.`}</p>
    </div>
    {giver && !reveal && secret?.word && <p className="reverse-secret"><span>YOUR SECRET WORD</span><strong>{secret.word}</strong></p>}
    {giver && s.phase === 'prepare' && !secret?.word && <Notice>Getting your word ready…</Notice>}
    {giver && s.phase === 'prepare' && secret?.word && <div className="audio-actions">
      <Button secondary data-sound="off" disabled={disabled || playing} onClick={() => listen(true)}><Play size={18} />{playing ? 'Playing backwards…' : 'Hear it backwards'}</Button>
      <Button data-sound="off" disabled={disabled || playing} onClick={record}><Mic size={18} />Record my one take</Button>
      <p>Up to {RECORD_SECONDS} seconds. You can replay the example as often as you like. No retakes once recording starts.</p>
      <small>Use headphones or mute your call so your partner won’t hear the secret practice. Allow microphone access when asked.</small>
    </div>}
    {giver && s.phase === 'recording' && <div className="audio-actions" aria-live="polite">
      {recording ? <><p className="recording-status">Recording · {elapsed}/{RECORD_SECONDS}s</p><Button data-sound="off" onClick={() => resources.current.mic?.stop()}><Square size={16} />Stop and send</Button></>
        : processing ? <Notice>Turning your recording around and sending it…</Notice>
        : <><Notice>Your one take has been used. If you rejoined after uploading, recover it; an interrupted take can be skipped.</Notice>
          <Button secondary disabled={disabled} onClick={recover}>Recover saved recording</Button>
          <Button secondary disabled={disabled || !secret?.word} onClick={() => verdict(false, true)}>Skip round</Button></>}
    </div>}
    {!giver && s.phase === 'guess' && <div className="audio-actions">
      <Button data-sound="off" disabled={disabled || playing || s.plays >= 3} onClick={() => listen(false)}><Play size={18} />{playing ? 'Playing…' : `Listen · ${3 - s.plays} left`}</Button>
      <p aria-live="polite">{s.plays} of 3 listens used. One guess. Exact answers pass automatically; your partner can accept a spelling slip.</p>
      <form className="action-form" onSubmit={(event) => { event.preventDefault(); send('guess', guess.trim()); }}>
        <Field label="Your one guess"><input value={guess} onChange={(event) => setGuess(event.target.value)} maxLength={80} required disabled={disabled} placeholder="What word did you hear?" /></Field>
        <Button disabled={disabled || !guess.trim()}>Submit my guess</Button>
      </form>
    </div>}
    {s.pending?.kind === 'guess' && <p className="reverse-answer"><span>{name(s.pending.actor)} guessed</span><strong>{s.pending.value}</strong></p>}
    {s.phase === 'pending' && s.pending?.kind === 'guess' && (giver ? exact ? <Notice>That’s an exact match! Adding your point…</Notice> : <div className="audio-actions">
      <p>Does their guess count? Spelling doesn’t have to be perfect.</p>
      <div className="form-buttons"><Button disabled={disabled || !secret?.word} onClick={() => verdict(true)}><Check size={18} />Pass</Button>
        <Button secondary disabled={disabled || !secret?.word} onClick={() => verdict(false)}><X size={18} />No pass</Button></div>
    </div> : <Notice>Checking your guess. Exact answers pass automatically; {name(s.giver)} can accept other spellings.</Notice>)}
    {giver && s.phase === 'guess' && <Notice>Your recording is ready. {name(s.players.find((p) => p !== uid))} has used {s.plays} of 3 listens.</Notice>}
    {!giver && ['prepare', 'recording'].includes(s.phase) && <Notice>Waiting for the one-take recording…</Notice>}
  </div>;
}
