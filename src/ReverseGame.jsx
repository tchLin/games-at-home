import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Mic, Play, Square, Check, X } from 'lucide-react';
import { db, ref, set, get, runTransaction } from './firebase.js';
import { Button, Field, Tag, Notice } from './App.jsx';
import { deadline, judgeReverse, isParty } from './engine.js';
import { pronunciationUrl } from './reverse-words.js';
import { isExactReverseGuess } from './reverse-game.js';
import { RECORD_SECONDS, MAX_LISTENS, reversedBuffer, subscribeMicrophone, microphoneReady, releaseMicrophone, audioContext, audioSession, resumeAudio, requireRunning, decode, playBuffer, microphone, reverseWav, toBase64, fromBase64 } from './reverse-audio.js';
import { submissionPath, nextListen, judgePartyReverse } from './party.js';
import { sounds } from './sound.js';

export default function ReverseGame({ room, s, secret, uid, name, disabled, mutate, act, now, base, send, submissions = {} }) {
  const [guess, setGuess] = useState('');
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState(false);
  const [published, setPublished] = useState(false);
  const [checking, setChecking] = useState(s.phase === 'recording');
  const micReady = useSyncExternalStore(subscribeMicrophone, microphoneReady, () => false);
  const resources = useRef({ alive: true });
  const giver = s.giver === uid;
  const party = isParty(s);
  const plays = party ? submissions[uid]?.plays || 0 : s.plays;
  const submitted = party && (s.progress[uid]?.done || submissions[uid]?.entries?.[0]);
  const audioPath = `roundAudio/${base.split('/')[1]}`;
  useEffect(() => {
    const r = resources.current;
    r.alive = true;
    const onVisibility = () => { if (document.visibilityState === 'hidden') r.mic?.stop(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      r.alive = false; r.stop?.(); r.mic?.cancel();
      r.restoreSession?.();
      clearInterval(r.timer); void r.context?.close(); sounds.setSuppressed(false);
    };
  }, []);
  useEffect(() => {
    if (!giver && s.phase !== 'guess') {
      resources.current.stop?.(); setPlaying(false);
    }
  }, [s.phase, giver]);
  useEffect(() => {
    if (!giver || s.phase !== 'recording') return;
    const r = resources.current;
    let current = true;
    setChecking(true);
    Promise.resolve(get(ref(db, audioPath))).then((snapshot) => {
      const clip = snapshot?.val();
      if (current && clip?.gameId === s.id && clip.round === s.round) {
        r.uploaded = clip.data; r.clip = null; r.take = null; setPublished(true);
      }
    }).catch(() => {}).finally(() => { if (current) setChecking(false); });
    return () => { current = false; };
  }, [giver, s.phase, s.id, s.round, audioPath]);
  const context = async () => {
    const r = resources.current;
    r.restoreSession ||= audioSession('playback');
    if (!r.context) {
      r.context = audioContext();
      r.context.onstatechange = () => {
        if (r.alive && r.context.state !== 'running') { r.stop?.(); setPlaying(false); }
      };
    }
    await resumeAudio(r.context);
    return r.context;
  };
  const listen = (reference, original = false) => act(async () => {
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
        let data = r.uploaded || r.draft;
        if (!data) {
          const clip = (await get(ref(db, audioPath))).val();
          if (clip?.gameId !== s.id || clip.round !== s.round) throw Error('The recording is not ready yet.');
          data = clip.data;
        }
        r.clip = await decode(ctx, fromBase64(data));
      }
      buffer = r.clip;
      if (!r.alive) return;
      requireRunning(ctx); // Don't spend a listen if loading was interrupted.
      if (original) buffer = r.take ||= reversedBuffer(ctx, buffer);
      if (!giver) {
        const claimed = party ? (await runTransaction(ref(db, submissionPath(base, s, uid)), nextListen, { applyLocally: false })).committed : await mutate((v) => v.id === s.id && v.round === s.round && v.phase === 'guess' && v.plays < MAX_LISTENS
        ? { ...v, plays: v.plays + 1 } : null);
        if (!claimed) throw Error('No listens remain, or this turn has ended.');
      }
    }
    if (!r.alive) return;
    r.stop?.();
    setPlaying(true);
    try { r.stop = playBuffer(ctx, buffer, () => { if (r.alive) setPlaying(false); }); }
    catch (error) { setPlaying(false); throw error; }
  });
  const record = () => {
    sounds.setSuppressed(true);
    resources.current.stop?.(); setPlaying(false);
    act(async () => {
      const r = resources.current;
      try {
        if (r.uploaded) throw Error('This recording has already been sent. You can record again next round.');
        const ctx = await context();
        r.mic = await microphone();
        if (!r.alive) return;
        const claimed = await mutate((v) => v.id === s.id && v.round === s.round &&
          ['prepare', 'recording'].includes(v.phase) && !v.pausedAt
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
        r.draft = toBase64(reverseWav(channels, buffer.sampleRate, { polish: true }));
        r.clip = null; r.take = null;
        if (r.alive) setDraft(true);
      } catch (error) {
        if (error.name === 'NotAllowedError') throw Error('Allow microphone access to record. In Safari: Page menu → Website Settings → Microphone → Allow.');
        throw error;
      } finally {
        clearInterval(r.timer); r.mic?.cancel(); r.mic = null; sounds.setSuppressed(false);
        if (r.alive) { setRecording(false); setProcessing(false); }
      }
    });
  };
  const publish = (recoverOnly = false) => act(async () => {
    const r = resources.current;
    const clockOffset = now - Date.now();
    // Recover an acknowledged OR uncertain earlier upload without replacing it.
    const existing = (await get(ref(db, audioPath))).val();
    if (!r.alive) return;
    if (existing?.gameId === s.id && existing.round === s.round) {
      if (r.uploaded !== existing.data) { r.clip = null; r.take = null; }
      r.uploaded = existing.data;
    } else {
      if (recoverOnly || !r.draft) throw Error('No recording has been sent. Record a take, review it, then send it.');
      await set(ref(db, audioPath), { roomCode: room.meta.code, gameId: s.id, round: s.round, owner: uid, data: r.draft });
      r.uploaded = r.draft;
    }
    if (!r.alive) return;
    setPublished(true);
    await mutate((v) => v.id === s.id && v.round === s.round && v.phase === 'recording' && !v.pausedAt
      ? { ...v, phase: 'guess', deadline: deadline(v, Date.now() + clockOffset) } : null);
  });
  const verdict = (pass, skip = false) => act(() => mutate((v) => party ? judgePartyReverse(v, secret, submissions, uid, pass, skip) : judgeReverse(v, secret, pass, skip), s));
  const reveal = s.phase === 'reveal';
  const exact = isExactReverseGuess(s, secret);
  return <div className="reverse-game">
    <div className="stage-title">
      <Tag>{reveal ? 'THE WORD WAS…' : giver ? 'YOU’RE THE VOICE' : 'YOU’RE THE LISTENER'}</Tag>
      <h2>{reveal ? s.result.word : giver ? 'A word, turned around.' : 'Sounds almost familiar.'}</h2>
      <p>{reveal ? party ? 'The round is complete. Everyone’s results are below.' : s.result.correct ? 'Pass! One point for the listener.' : 'No point this time. Swap roles next round.'
        : giver ? 'Listen to the backwards pronunciation, record your imitation, then review it. Send the take you like.'
        : `${name(s.giver)} is making a backwards recording. You get five listens and one guess.`}</p>
    </div>
    {giver && !reveal && secret?.word && <p className="reverse-secret"><span>YOUR SECRET WORD</span><strong>{secret.word}</strong></p>}
    {giver && s.phase === 'prepare' && !secret?.word && <Notice>Getting your word ready…</Notice>}
    {giver && ['prepare', 'recording'].includes(s.phase) && secret?.word && <div className="audio-actions">
      {recording ? <><p className="recording-status" aria-live="polite">Recording · {elapsed}/{RECORD_SECONDS}s</p>
        <Button data-sound="off" onClick={() => resources.current.mic?.stop()}><Square size={16} />Stop recording</Button></>
      : processing ? <Notice>Preparing your take for a private review…</Notice>
      : checking ? <Notice>Checking for a saved recording…</Notice>
      : published ? <><Notice>Your recording was sent. Continue the guessing round without replacing it.</Notice>
        <Button secondary disabled={disabled} onClick={() => publish(true)}>Continue with saved recording</Button></>
      : <>
        <Button secondary data-sound="off" disabled={disabled || playing} onClick={() => listen(true)}><Play size={18} />Hear it backwards</Button>
        {draft && <>
          <div className="form-buttons">
            <Button secondary data-sound="off" disabled={disabled || playing} onClick={() => listen(false, true)}>Hear my take</Button>
            <Button secondary data-sound="off" disabled={disabled || playing} onClick={() => listen(false)}>Hear it flipped</Button>
          </div>
          <p>“Hear it flipped” is what the guessers will hear. Your take stays on this device until you send it.</p>
        </>}
        <Button secondary={draft} data-sound="off" disabled={disabled || playing} onClick={record}><Mic size={18} />{draft ? 'Record again' : 'Record my take'}</Button>
        {draft && <Button disabled={disabled || playing} onClick={() => publish()}>Send this recording</Button>}
        <p>Up to {RECORD_SECONDS} seconds per take. Review and record again as often as you like before sending.</p>
        <small>Use headphones or mute your call so the others won’t hear your practice.</small>
        {s.phase === 'recording' && !draft && <Button secondary disabled={disabled} onClick={() => publish(true)}>Recover saved recording</Button>}
      </>}
      {s.phase === 'recording' && !recording && !processing && <Button secondary disabled={disabled || !secret?.word} onClick={() => verdict(false, true)}>Skip round</Button>}
    </div>}
    {giver && ['guess', 'pending', 'reveal'].includes(s.phase) && <div className="audio-actions">
      <Button secondary data-sound="off" disabled={disabled || playing} onClick={() => listen(false)}><Play size={18} />Replay my recording</Button>
      <Button secondary data-sound="off" disabled={disabled || playing} onClick={() => listen(false, true)}>Hear my original take</Button>
      <small>Private playback on your device. Unlimited replays; the guessers’ listens are unaffected.</small>
    </div>}
    {micReady && !recording && <div className="microphone-access">
      <small>Microphone access is kept for this game, muted between takes.</small>
      <button type="button" className="text-button" onClick={releaseMicrophone}>Release microphone</button>
    </div>}
    {!giver && s.phase === 'guess' && !submitted && <div className="audio-actions">
      <Button data-sound="off" disabled={disabled || playing || plays >= MAX_LISTENS} onClick={() => listen(false)}><Play size={18} />{playing ? 'Playing…' : `Listen · ${MAX_LISTENS - plays} left`}</Button>
      <p aria-live="polite">{plays} of {MAX_LISTENS} listens used. One guess. Exact answers pass automatically; your partner can accept a spelling slip.</p>
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
    {giver && s.phase === 'guess' && <Notice>{party ? 'Your recording is ready for everyone. Each listener gets five plays and one guess.' : <>Your recording is ready. {name(s.players.find((p) => p !== uid))} has used {s.plays} of {MAX_LISTENS} listens.</>}</Notice>}
    {!giver && ['prepare', 'recording'].includes(s.phase) && <Notice>Waiting for the recorder to review and send a take…</Notice>}
  </div>;
}
