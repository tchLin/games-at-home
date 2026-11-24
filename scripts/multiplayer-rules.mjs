import { MAX_LISTENS } from '../src/audio-limits.js';
// Fixed seat fields and bounded private submissions keep limits enforceable in
// RTDB rules (which have no child-count operation).
export function multiplayerRules(rules, c) {
  const { state, meta, host, member, memberFor, allowed, active, read, write, matchState: s, sameConfig, str, num, bool, seats } = c;
  const room = rules.rooms.$slot;
  const eq = (a, b, keys) => keys.map((key) => `${a}.child('${key}').val() === ${b}.child('${key}').val()`).join(' && ');
  const same = (keys) => eq('newData', 'data', keys);
  const guests = seats.slice(1);
  const allGuestsSame = same(guests);
  const noGuests = guests.map((seat) => `!newData.hasChild('${seat}')`).join(' && ');
  const claim = guests.map((seat) => `(
    (!data.hasChild('${seat}') || data.child('${seat}').val() === auth.uid) && newData.child('${seat}').val() === auth.uid &&
    (!${s}.exists() || data.child('${seat}').val() === auth.uid) &&
    ${seats.filter((other) => other !== seat).map((other) => `data.child('${other}').val() !== auth.uid`).join(' && ')} &&
    ${same(seats.filter((other) => other !== seat))} && ${same(['code','createdAt','leaseEnd','open'])}
  )`).join(' || ');
  room.meta['.write'] = `${allowed} && newData.exists() && (
    (data.child('host').val() === auth.uid && newData.child('host').val() === auth.uid && newData.child('code').val() === data.child('code').val() && ${allGuestsSame}) ||
    ((!data.exists() || data.child('open').val() === false || data.child('leaseEnd').val() <= now) && newData.child('host').val() === auth.uid && ${noGuests}) ||
    (data.child('open').val() === true && data.child('leaseEnd').val() > now && newData.child('joinCode').val() === data.child('code').val() && (${claim})))`;
  room.meta['.validate'] += ` && ($slot !== '0' || (!newData.hasChild('guest2') && !newData.hasChild('guest3') && !newData.hasChild('guest4'))) && ` +
    guests.map((seat, i) => `(!newData.hasChild('${seat}') || (newData.hasChild('${seats[i]}') && ${seats.slice(0, i+1).map((other) => `newData.child('${seat}').val() !== newData.child('${other}').val()`).join(' && ')}))`).join(' && ');
  for (const seat of guests) room.meta[seat] = { ...str(128), '.write': `${allowed} && ${active} && data.val() === auth.uid && newData.val() === auth.uid` };
  state.players['.validate'] = `newData.hasChildren(['0','1']) && ` + seats.map((seat, i) => `newData.child('${i}').val() === ${meta}.child('${seat}').val()`).join(' && ');

  const party = "newData.child('players').hasChild('2') && newData.child('game').val() !== 'chain'";
  // Existing two-player transitions remain valid for rooms already open.
  state['.validate'] = state['.validate'].replace("newData.child('game').val() !== 'reverse' || (", "newData.child('game').val() !== 'reverse' || newData.child('players').hasChild('2') || (");
  const uidProgress = {
    '.validate': `${memberFor('$uid')} && $uid !== newData.parent().parent().child('giver').val() && newData.hasChildren(['count','used','done','correct','points'])`,
    count: num(0,15), used: num(0,5), done: bool, correct: bool, points: num(0,4), $other: { '.validate': false },
  };
  state.progress = { $uid: uidProgress };
  state.results = {
    '.validate': "newData.parent().child('phase').val() === 'reveal' || newData.parent().child('phase').val() === 'finished'",
    $uid: { '.validate': `${memberFor('$uid')} && newData.hasChildren(['points','correct','timedOut'])`,
      points: num(0,4), correct: bool, timedOut: bool, guess: num(-1,100),
      attempts: { $i: { '.validate': "$i.matches(/^([0-9]|1[0-4])$/) && newData.hasChildren(['guess','hint','correct'])",
        guess: str(80), hint: num(0,3), correct: bool, $other: { '.validate': false } } },
      $other: { '.validate': false },
    },
  };
  const samePlayers = eq("newData.child('players')", "data.child('players')", ['0','1','2','3','4']);
  const resetPrivate = "!newData.parent().parent().parent().child('submissions').child($slot).exists()";
  const rotated = seats.map((_, i) => `(data.child('giver').val() === data.child('players').child('${i}').val() && newData.child('giver').val() === (data.child('players').hasChild('${i+1}') ? data.child('players').child('${i+1}').val() : data.child('players').child('0').val()))`).join(' || ');
  const initial = `${resetPrivate} && newData.child('phase').val() === 'prepare' && ` + seats.map((seat) => `(!${meta}.hasChild('${seat}') || newData.child('giver').val() === ${meta}.child('${seat}').val() || (newData.child('progress').child(${meta}.child('${seat}').val()).child('count').val() === 0 && newData.child('progress').child(${meta}.child('${seat}').val()).child('used').val() === 0 && newData.child('progress').child(${meta}.child('${seat}').val()).child('done').val() === false && newData.child('progress').child(${meta}.child('${seat}').val()).child('points').val() === 0))`).join(' && ');
  const oldPhase = (p) => `data.child('phase').val() === '${p}'`;
  const newPhase = (p) => `newData.child('phase').val() === '${p}'`;
  const giver = "data.child('giver').val() === auth.uid";
  const transition = `newData.child('phase').val() === data.child('phase').val() ||
    (${giver} && ((${oldPhase('prepare')} && (${newPhase('clue')} || ${newPhase('hint')} || ${newPhase('recording')})) ||
      ((${oldPhase('clue')} || ${oldPhase('hint')} || ${oldPhase('recording')}) && ${newPhase('guess')}) ||
      (${oldPhase('guess')} && (${newPhase('hint')} || ${newPhase('reveal')})) || (${oldPhase('recording')} && ${newPhase('reveal')}))) ||
    (${host} && ${oldPhase('reveal')} && ${newPhase('finished')})`;
  const unchangedProgress = seats.map((seat) => `(!${meta}.hasChild('${seat}') || (${eq(`newData.child('progress').child(${meta}.child('${seat}').val())`, `data.child('progress').child(${meta}.child('${seat}').val())`, ['count','used','done','correct','points'])} && newData.child('scores').child(${meta}.child('${seat}').val()).val() === data.child('scores').child(${meta}.child('${seat}').val()).val()))`).join(' && ');
  // Any participant can pause on a disconnect, even if host AND giver are away.
  // This exception permits only a pause marker/revision, never role/progress edits.
  const pauseOnly = `!data.hasChild('pausedAt') && newData.child('pausedAt').isNumber() && newData.child('pausedAt').val() >= now - 30000 && newData.child('pausedAt').val() <= now + 1000 &&
    !(${oldPhase('reveal')}) && !(${oldPhase('finished')}) &&
    ${same(['phase','deadline','turn','winner','topicSeed','topicLabel','left','right','clue','hintIndex','used','recorded','plays'])} &&
    ${eq("newData.child('hints')", "data.child('hints')", ['0','1','2'])} && ${unchangedProgress} &&
    !newData.hasChild('result') && !newData.hasChild('results') && !newData.hasChild('pending') && !newData.hasChild('boards') && !newData.hasChild('feedback')`;
  state['.validate'] += ` && (!(${party}) || (
    newData.hasChild('progress') && ${memberFor("newData.child('giver').val()")} &&
    ((!data.exists() || newData.child('id').val() !== data.child('id').val())
      ? (${host} && ${initial} && (newData.child('giver').val() === ${meta}.child('host').val() || (newData.parent().child('postGame').child('choice').val() === 'again' && (${rotated}))))
      : (${samePlayers} && ${sameConfig} && ${same(['game'])} &&
        (newData.child('round').val() === data.child('round').val()
          ? ((${host} || ${giver} || (${pauseOnly})) && ${same(['giver'])} && (${transition}) &&
            (newData.child('recorded').val() === data.child('recorded').val() || (${giver} && ${oldPhase('prepare')} && ${newPhase('recording')} && newData.child('recorded').val() === true)))
          : (${host} && ${oldPhase('reveal')} && newData.child('round').val() === data.child('round').val() + 1 && (${rotated}) && ${initial})))
  )))`;
  // Prevent opting out of the guards by dropping seats or changing game type.
  state['.validate'] += ` && (!data.child('players').hasChild('2') || newData.child('id').val() !== data.child('id').val() || (${samePlayers} && ${same(['game'])}))`;

  const current = `$gameId === ${s}.child('id').val() && $round === ('' + ${s}.child('round').val()) && ${s}.child('players').hasChild('2')`;
  const own = `${write} && ${current} && auth.uid === $uid && $uid !== ${s}.child('giver').val() && newData.exists() && ${s}.child('phase').val() === 'guess' && !${s}.hasChild('pausedAt') && ${s}.child('progress').child($uid).child('done').val() === false`;
  const preserveEntries = Array.from({length:15},(_,i)=>`(!data.child('entries').hasChild('${i}') || (newData.child('entries').child('${i}').child('value').val() === data.child('entries').child('${i}').child('value').val() && newData.child('entries').child('${i}').child('hint').val() === data.child('entries').child('${i}').child('hint').val()))`).join(' && ');
  rules.submissions = { $slot: {
    '.write': `${allowed} && ${host} && !newData.exists() && (!newData.parent().parent().child('rooms').child($slot).child('state').exists() || newData.parent().parent().child('rooms').child($slot).child('meta').child('open').val() === false || newData.parent().parent().child('rooms').child($slot).child('state').child('id').val() !== ${s}.child('id').val() || newData.parent().parent().child('rooms').child($slot).child('state').child('round').val() !== ${s}.child('round').val())`,
    $gameId: { $round: { $uid: {
      '.read': `${write} && ${current} && (auth.uid === $uid || auth.uid === ${s}.child('giver').val())`,
      '.write': own,
      '.validate': `${memberFor('$uid')} && ${preserveEntries} && (!data.hasChild('plays') || newData.hasChild('plays'))`,
      plays: { '.validate': `${s}.child('game').val() === 'reverse' && newData.isNumber() && newData.val() >= 1 && newData.val() <= ${MAX_LISTENS} && ((!data.exists() && newData.val() === 1) || newData.val() === data.val() || newData.val() === data.val() + 1)` },
      entries: { $i: {
        '.validate': `$i.matches(/^([0-9]|1[0-4])$/) && newData.hasChildren(['value','hint']) && (data.exists() || ($i === ('' + ${s}.child('progress').child($uid).child('count').val()) && (${s}.child('game').val() === 'clues' ? (${s}.child('progress').child($uid).child('used').val() < ${s}.child('config').child('guessesPerHint').val() && newData.child('hint').val() === ${s}.child('hintIndex').val()) : ($i === '0' && newData.child('hint').val() === 0))))`,
        value: { '.validate': `(${s}.child('game').val() === 'wheel' ? (newData.isNumber() && newData.val() >= 0 && newData.val() <= 100) : (newData.isString() && newData.val().length > 0 && newData.val().length <= 80))` },
        hint: num(0,3), $other: { '.validate': false },
      } },
      $other: { '.validate': false },
    } } },
  } };

  const gc = room.gameChange;
  const sameRequest = same(['gameId','requestId','requestedBy']);
  const currentRequest = `data.child('gameId').val() === ${s}.child('id').val()`;
  const allVotes = seats.map((seat) => `(!${meta}.hasChild('${seat}') || newData.child('votes').child(${meta}.child('${seat}').val()).val() === true)`).join(' && ');
  const preserveVotes = seats.map((seat) => `(!${meta}.hasChild('${seat}') || !data.child('votes').hasChild(${meta}.child('${seat}').val()) || newData.child('votes').child(${meta}.child('${seat}').val()).val() === true)`).join(' && ');
  const legacyWrite = gc['.write'];
  gc['.write'] = `((${legacyWrite}) && (!${s}.child('players').hasChild('2') || !newData.exists())) || (${write} && (
    ((!data.exists() || data.child('gameId').val() !== ${s}.child('id').val()) && ${s}.exists() && newData.child('gameId').val() === ${s}.child('id').val() && newData.child('requestedBy').val() === auth.uid && newData.child('accepted').val() === false && newData.child('completed').val() === false && newData.child('votes').child(auth.uid).val() === true) ||
    (${sameRequest} && ${currentRequest} && data.child('accepted').val() === false && data.child('completed').val() === false && newData.child('completed').val() === false && ${preserveVotes} && newData.child('votes').child(auth.uid).val() === true && newData.child('accepted').val() === (${allVotes})) ||
    (${sameRequest} && ${currentRequest} && ${host} && data.child('accepted').val() === true && newData.child('accepted').val() === true && ${preserveVotes} && newData.child('completed').val() === true && !newData.parent().child('state').exists() && !newData.parent().child('ready').exists())
  ))`;
  gc.votes = { $uid: { '.validate': `${memberFor('$uid')} && newData.val() === true && ((data.val() === true && newData.parent().parent().child('requestId').val() === data.parent().parent().child('requestId').val() && newData.parent().parent().child('gameId').val() === data.parent().parent().child('gameId').val()) || auth.uid === $uid)` } };
}
