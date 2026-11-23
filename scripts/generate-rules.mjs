import { writeFileSync } from "node:fs";
import { multiplayerRules } from "./multiplayer-rules.mjs";
const signed =
  "auth != null && auth.token.email_verified === true && auth.token.firebase.sign_in_provider === 'google.com'";
const player = `auth != null && (auth.token.firebase.sign_in_provider === 'anonymous' || (${signed}))`;
const priority =
  `(${signed} && root.child('priority').child(auth.token.email.toLowerCase().replace('.', '%2E')).val() === true)`;
const slot =
  "($slot === '0' || $slot === '1' || $slot === '2' || $slot === '3' || $slot === '4')";
const allowed = `${player} && ${slot} && ($slot !== '0' || ${priority})`;
const meta = "root.child('rooms').child($slot).child('meta')";
const host = `${meta}.child('host').val() === auth.uid`;
const seats = ['host', 'guest', 'guest2', 'guest3', 'guest4'];
const memberFor = (uid) => `(${seats.map((seat) => `${meta}.child('${seat}').val() === ${uid}`).join(' || ')})`;
const member = memberFor('auth.uid');
const active = `${meta}.child('open').val() === true && ${meta}.child('leaseEnd').val() > now`;
const read = `${allowed} && ${member}`;
const write = `${read} && ${active}`;
const str = (max) => ({
  ".validate": `newData.isString() && newData.val().length > 0 && newData.val().length <= ${max}`,
});
const num = (min, max) => ({
  ".validate": `newData.isNumber() && newData.val() >= ${min} && newData.val() <= ${max}`,
});
const bool = { ".validate": "newData.isBoolean()" };
const config = {
  ".validate":
    "newData.hasChildren(['game','rounds','timer','wordCount','guessesPerHint','category','topic','left','right','version'])",
  game: {
    ".validate":
      "newData.val() === 'wheel' || newData.val() === 'chain' || newData.val() === 'clues' || newData.val() === 'reverse'",
  },
  rounds: num(1, 20),
  timer: num(0, 300),
  wordCount: num(3, 12),
  guessesPerHint: num(1, 5),
  reverseSyllables: { '.validate': "newData.val() === 1 || newData.val() === 2 || newData.val() === 3 || newData.val() === 4" },
  category: str(30),
  topic: str(20),
  left: str(60),
  right: str(60),
  version: num(1, 1e15),
  $other: { ".validate": false },
};
const guestReady = `${meta}.hasChild('guest') && ` + seats.slice(1).map((seat) => `(!${meta}.hasChild('${seat}') || (root.child('rooms').child($slot).child('ready').child(${meta}.child('${seat}').val()).isNumber() && root.child('rooms').child($slot).child('ready').child(${meta}.child('${seat}').val()).val() > 0))`).join(' && ');
const endedState = (snapshot) => `(${snapshot}.child('phase').val() === 'finished' || (${snapshot}.child('phase').val() === 'reveal' && ${snapshot}.child('round').val() >= ${snapshot}.child('config').child('rounds').val()))`;
const decision = "newData.parent().child('postGame')";
const hostEncore = `${endedState('data')} && ${decision}.child('choice').val() === 'again' && ${decision}.child('gameId').val() === data.child('id').val() && ${decision}.child('nextId').val() === newData.child('id').val() && newData.child('game').val() === data.child('game').val()`;
const state = {
  ".read": read,
  ".write": `${write} && ((${host} && (!newData.exists() || (data.exists() && newData.child('id').val() === data.child('id').val()) || (${guestReady}) || (${hostEncore}))) || (data.exists() && newData.child('id').val() === data.child('id').val() && newData.child('game').val() === data.child('game').val() && newData.child('round').val() === data.child('round').val()))`,
  ".validate":
    "newData.hasChildren(['id','game','phase','config','round','players','scores','revision']) && newData.numChildren() <= 25",
  id: str(50),
  game: str(10),
  phase: {
    ".validate":
      "newData.val() === 'prepare' || newData.val() === 'clue' || newData.val() === 'guess' || newData.val() === 'pending' || newData.val() === 'reveal' || newData.val() === 'setup' || newData.val() === 'hint' || newData.val() === 'finished' || newData.val() === 'recording'",
  },
  config,
  round: num(1, 20),
  revision: num(0, 1e9),
  giver: str(128),
  turn: str(128),
  winner: str(128),
  deadline: num(0, 1e15),
  pausedAt: num(0, 1e15),
  topicSeed: num(0, 100),
  topicLabel: str(40),
  left: str(60),
  right: str(60),
  clue: str(100),
  hintIndex: num(0, 3),
  used: num(0, 5),
  recorded: bool,
  plays: { '.validate': 'newData.val() === 0 || newData.val() === 1 || newData.val() === 2 || newData.val() === 3' },
  players: {
    ".validate": `newData.numChildren() === 2 && newData.child('0').val() === ${meta}.child('host').val() && newData.child('1').val() === ${meta}.child('guest').val()`,
  },
  scores: {
    ".validate": "newData.numChildren() === 2",
    $uid: {
      ".validate": `${memberFor('$uid')} && newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000`,
    },
  },
  boards: {
    ".validate": "newData.numChildren() <= 2",
    $uid: {
      ".validate": `${memberFor('$uid')} && newData.hasChild('masks')`,
      masks: {
        ".validate":
          "newData.numChildren() >= 3 && newData.numChildren() <= 12",
        $index: str(40),
      },
      solved: { ".validate": "newData.numChildren() <= 12", $index: bool },
      letters: {
        ".validate": "newData.numChildren() <= 12",
        $index: num(1, 40),
      },
      guesses: {
        $index: {
          $attempt: {
            ".validate": "newData.hasChildren(['guess', 'correct'])",
            guess: str(80),
            correct: bool,
            $other: { ".validate": false },
          },
        },
      },
      guessCounts: { $index: num(1, 1e9) },
      answers: {
        ".validate": "newData.parent().parent().parent().child('phase').val() === 'finished' && newData.parent().parent().parent().child('game').val() === 'chain' && newData.hasChildren(['0','1','2'])",
        $index: {
          ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 40 && ((data.exists() && newData.val() === data.val()) || (auth.uid === $uid && newData.val() === root.child('secrets').child($slot).child($uid).child('words').child($index).val() && root.child('secrets').child($slot).child($uid).child('gameId').val() === newData.parent().parent().parent().parent().child('id').val() && root.child('secrets').child($slot).child($uid).child('round').val() === newData.parent().parent().parent().parent().child('round').val()))",
        },
      },
      $other: { ".validate": false },
    },
  },
  hints: { ".validate": "newData.numChildren() <= 3", $i: str(40) },
  attempts: {
    ".validate": "newData.numChildren() <= 15",
    $i: {
      ".validate": "newData.hasChildren(['guess','correct','hint'])",
      guess: str(80),
      correct: bool,
      hint: num(1, 3),
      $other: { ".validate": false },
    },
  },
  pending: {
    ".validate": "newData.hasChildren(['actor','kind'])",
    actor: str(128),
    kind: {
      ".validate":
        "newData.val() === 'guess' || newData.val() === 'hint' || newData.val() === 'timeout'",
    },
    value: {
      ".validate":
        "(newData.isString() && newData.val().length <= 80) || (newData.isNumber() && newData.val() >= 0 && newData.val() <= 100)",
    },
    index: num(0, 11),
    $other: { ".validate": false },
  },
  result: {
    target: num(0, 100),
    guess: num(-1, 100),
    points: num(0, 4),
    timedOut: bool,
    word: str(40),
    correct: bool,
    $other: { ".validate": false },
  },
  feedback: {
    actor: str(128),
    text: str(200),
    kind: str(20),
    $other: { ".validate": false },
  },
  $other: { ".validate": false },
};
const matchState = "root.child('rooms').child($slot).child('state')";
const clip = "root.child('roundAudio').child($slot)";
const giverSecret = `root.child('secrets').child($slot).child(data.child('giver').val())`;
const equalChildren = (path, keys) => keys.map((key) => `newData.child('${path}').child('${key}').val() === data.child('${path}').child('${key}').val()`).join(' && ');
const sameConfig = equalChildren('config', Object.keys(config).filter((key) => !key.startsWith('.') && !key.startsWith('$')));
const samePending = equalChildren('pending', ['actor', 'kind', 'value', 'index']);
const sameRound = "newData.child('id').val() === data.child('id').val() && newData.child('round').val() === data.child('round').val()";
const isGiver = "auth.uid === data.child('giver').val()";
const phase = (value, source = 'data') => `${source}.child('phase').val() === '${value}'`;
// Preserve the one take, three listens and one guess across refreshes/tabs.
// Room members can still access their clip bytes: this is a game rule, not DRM.
state['.validate'] += ` && (newData.child('game').val() !== 'reverse' || (
  newData.hasChildren(['recorded','plays','giver']) && (
    ((!data.exists() || !(${sameRound})) && ${host} && ${phase('prepare', 'newData')} && newData.child('recorded').val() === false && newData.child('plays').val() === 0 &&
      (!data.exists() || newData.child('id').val() !== data.child('id').val() || (${phase('reveal')} && newData.child('round').val() === data.child('round').val() + 1))) ||
    ((${sameRound}) && newData.child('giver').val() === data.child('giver').val() && (${sameConfig}) &&
      (newData.child('recorded').val() === data.child('recorded').val() || (${phase('prepare')} && ${phase('recording','newData')} && ${isGiver} && newData.child('recorded').val() === true)) &&
      (newData.child('plays').val() === data.child('plays').val() || (${phase('guess')} && ${phase('guess','newData')} && !(${isGiver}) && newData.child('plays').val() === data.child('plays').val() + 1)) &&
      (!data.hasChild('pending') || (${samePending})) &&
      (newData.child('phase').val() === data.child('phase').val() ||
        (${phase('prepare')} && ${phase('recording','newData')} && ${isGiver} && newData.child('recorded').val() === true) ||
        (${phase('recording')} && ${phase('guess','newData')} && ${isGiver} && ${clip}.child('gameId').val() === data.child('id').val() && ${clip}.child('round').val() === data.child('round').val()) ||
        (${phase('guess')} && ${phase('pending','newData')} && newData.child('pending').child('actor').val() !== data.child('giver').val() &&
          ((newData.child('pending').child('kind').val() === 'guess' && !(${isGiver}) && newData.child('pending').child('actor').val() === auth.uid && newData.child('pending').child('value').isString() && newData.child('pending').child('value').val().length > 0) ||
          (newData.child('pending').child('kind').val() === 'timeout' && ${host} && data.child('deadline').val() > 0 && data.child('deadline').val() <= now))) ||
        ((${phase('pending')} || ${phase('recording')}) && ${phase('reveal','newData')} && ${isGiver} &&
          newData.child('result').child('word').val() === ${giverSecret}.child('word').val() && ${giverSecret}.child('gameId').val() === data.child('id').val() && ${giverSecret}.child('round').val() === data.child('round').val() &&
          ((newData.child('result').child('points').val() === 1 && newData.child('result').child('correct').val() === true && data.child('pending').child('kind').val() === 'guess') ||
          (newData.child('result').child('points').val() === 0 && newData.child('result').child('correct').val() === false))) ||
        (${phase('reveal')} && ${phase('finished','newData')} && ${host})) &&
      (!newData.hasChild('result') || ${phase('reveal','newData')} || ${phase('finished','newData')}) &&
      ((${samePending}) || (${phase('guess')} && ${phase('pending','newData')}))
    )
  )
))`;
const sameRequest = "newData.child('gameId').val() === data.child('gameId').val() && newData.child('requestId').val() === data.child('requestId').val() && newData.child('requestedBy').val() === data.child('requestedBy').val()";
const currentRequest = `data.child('gameId').val() === ${matchState}.child('id').val()`;
const gameChange = {
  ".read": read,
  ".write": `${write} && ((!newData.exists() && (${host} || data.child('accepted').val() === false)) || (newData.exists() && ((!data.exists() || data.child('gameId').val() !== ${matchState}.child('id').val()) && ${matchState}.exists() && newData.child('gameId').val() === ${matchState}.child('id').val() && newData.child('requestedBy').val() === auth.uid && newData.child('accepted').val() === false && newData.child('completed').val() === false) || (${sameRequest} && data.child('accepted').val() === false && data.child('completed').val() === false && ${currentRequest} && auth.uid !== data.child('requestedBy').val() && newData.child('accepted').val() === true && newData.child('completed').val() === false) || (${sameRequest} && ${host} && data.child('accepted').val() === true && newData.child('accepted').val() === true && newData.child('completed').val() === true && (${currentRequest} || (!${matchState}.exists() && data.child('completed').val() === true)) && !newData.parent().child('state').exists() && !newData.parent().child('ready').exists())))`,
  ".validate": "newData.hasChildren(['gameId','requestId','requestedBy','accepted','completed'])",
  gameId: str(50),
  requestId: str(50),
  requestedBy: str(128),
  accepted: bool,
  completed: bool,
  $other: { ".validate": false },
};
const rules = {
  ".read": false,
  ".write": false,
  priority: {
    $email: {
      ".read": `${signed} && $email === auth.token.email.toLowerCase().replace('.', '%2E')`,
      ".write": false,
    },
  },
  rooms: {
    $slot: {
      ".write": `${allowed} && ${host} && !newData.exists()`,
      meta: {
        ".read": `${allowed} && (${member} || ($slot === '0' && ${priority}))`,
        ".write": `${allowed} && newData.exists() && ((data.child('host').val() === auth.uid && newData.child('host').val() === auth.uid && newData.child('code').val() === data.child('code').val()) || ((!data.exists() || data.child('open').val() === false || data.child('leaseEnd').val() <= now) && newData.child('host').val() === auth.uid && !newData.hasChild('guest')) || (data.child('open').val() === true && data.child('leaseEnd').val() > now && (!data.hasChild('guest') || data.child('guest').val() === auth.uid) && data.child('host').val() !== auth.uid && newData.child('guest').val() === auth.uid && newData.child('joinCode').val() === data.child('code').val() && newData.child('host').val() === data.child('host').val() && newData.child('code').val() === data.child('code').val() && newData.child('createdAt').val() === data.child('createdAt').val() && newData.child('leaseEnd').val() === data.child('leaseEnd').val() && newData.child('open').val() === data.child('open').val()))`,
        ".validate":
          "newData.hasChildren(['host','code','open','createdAt','leaseEnd']) && newData.numChildren() <= 6",
        host: str(128),
        code: {
          ".validate":
            "newData.isString() && newData.val().length === 8 && newData.val().beginsWith($slot)",
        },
        open: bool,
        createdAt: num(0, 1e15),
        leaseEnd: {
          ".validate": "newData.isNumber() && newData.val() <= now + 86460000",
        },
        guest: {
          ".write": `${allowed} && ${active} && data.val() === auth.uid && newData.val() === auth.uid`,
          ...str(128),
        },
        joinCode: str(8),
        $other: { ".validate": false },
      },
      settings: { ".read": read, ".write": `${write} && ${host}`, ...config },
      players: {
        ".read": read,
        ".write": `${write} && ${host}`,
        ".validate": "newData.numChildren() <= 2",
        $uid: {
          ".write": `${write} && auth.uid === $uid`,
          ".validate": `${memberFor('$uid')} && newData.hasChild('name')`,
          name: str(24),
          $other: { ".validate": false },
        },
      },
      ready: {
        ".read": read,
        ".write": `${write} && ${host}`,
        ".validate": "newData.numChildren() <= 2",
        $uid: { ".write": `${write} && auth.uid === $uid`, ...num(0, 1e15) },
      },
      presence: {
        ".read": read,
        ".write": `${write} && ${host} && !newData.exists()`,
        ".validate": "newData.numChildren() <= 2",
        $uid: {
          ".write": `${read} && auth.uid === $uid`,
          ".validate": `${memberFor('$uid')} && newData.numChildren() <= 3`,
          $connection: { ".validate": "newData.val() === true" },
        },
      },
      state,
      gameChange,
      postGame: {
        '.read': read,
        '.write': `${write} && ${host} && (!newData.exists() || (${endedState(matchState)} && newData.child('gameId').val() === ${matchState}.child('id').val()))`,
        '.validate': `newData.hasChildren(['gameId','choice']) && !newData.parent().child('ready').exists() && !newData.parent().child('gameChange').exists() && ((newData.child('choice').val() === 'lobby' && !newData.hasChild('nextId') && !newData.parent().child('state').exists()) || (newData.child('choice').val() === 'again' && newData.child('nextId').val() !== newData.child('gameId').val() && newData.child('nextId').val() === newData.parent().child('state').child('id').val() && newData.parent().child('state').child('game').val() === ${matchState}.child('game').val()))`,
        gameId: str(50), choice: { '.validate': "newData.val() === 'again' || newData.val() === 'lobby'" }, nextId: str(50),
        $other: { '.validate': false },
      },
      $other: { ".validate": false },
    },
  },
  secrets: {
    $slot: {
      ".write": `${allowed} && ${host} && !newData.exists()`,
      ".validate": "newData.numChildren() <= 2",
      $uid: {
        ".read": `${read} && auth.uid === $uid`,
        ".write": `${write} && auth.uid === $uid`,
        ".validate":
          "newData.hasChildren(['gameId','round']) && newData.numChildren() <= 5",
        gameId: str(50),
        round: num(1, 20),
        target: num(0, 100),
        word: str(40),
        words: {
          ".validate":
            "newData.numChildren() >= 3 && newData.numChildren() <= 12",
          $i: str(40),
        },
        $other: { ".validate": false },
      },
    },
  },
  roundAudio: {
    $slot: {
      '.read': `${write} && ${matchState}.child('game').val() === 'reverse' && (!data.exists() || (data.child('roomCode').val() === ${meta}.child('code').val() && data.child('gameId').val() === ${matchState}.child('id').val() && data.child('round').val() === ${matchState}.child('round').val()))`,
      '.write': `${allowed} && ((${host} && !newData.exists() && (newData.parent().parent().child('rooms').child($slot).child('meta').child('open').val() !== true || data.child('roomCode').val() !== ${meta}.child('code').val() || data.child('gameId').val() !== newData.parent().parent().child('rooms').child($slot).child('state').child('id').val() || data.child('round').val() !== newData.parent().parent().child('rooms').child($slot).child('state').child('round').val())) || (${active} && ${member} && ${matchState}.child('game').val() === 'reverse' && ${matchState}.child('phase').val() === 'recording' && ${matchState}.child('recorded').val() === true && ${matchState}.child('giver').val() === auth.uid && newData.exists() && (!data.exists() || data.child('roomCode').val() !== ${meta}.child('code').val() || data.child('gameId').val() !== ${matchState}.child('id').val() || data.child('round').val() !== ${matchState}.child('round').val())))`,
      '.validate': `newData.hasChildren(['roomCode','gameId','round','owner','data']) && newData.child('roomCode').val() === ${meta}.child('code').val() && newData.child('gameId').val() === ${matchState}.child('id').val() && newData.child('round').val() === ${matchState}.child('round').val() && newData.child('owner').val() === auth.uid`,
      roomCode: str(8), gameId: str(50), round: num(1,20), owner: str(128),
      data: { '.validate': "newData.isString() && newData.val().length >= 64 && newData.val().length <= 256060 && newData.val().beginsWith('UklGR') && newData.val().matches(/^[A-Za-z0-9+\\/=]+$/)" },
      $other: { '.validate': false },
    },
  },
};
multiplayerRules(rules, { state, meta, host, member, memberFor, allowed, active, read, write, matchState, sameConfig, str, num, bool, seats });
// Realtime Database rules have no child-count method. Bound collections by key
// and reject unknown keys, so payload limits are enforced on the server.
function removeCounts(node) {
  if (!node || typeof node !== "object") return;
  if (typeof node[".validate"] === "string")
    node[".validate"] = node[".validate"].replace(
      /newData\.numChildren\(\) (?:<=|>=|===) \d+/g,
      "true",
    );
  for (const value of Object.values(node)) removeCounts(value);
}
removeCounts(rules);
const indexRule = (node, key, pattern) => {
  node[key] = {
    ...node[key],
    ".validate": `${key}.matches(${pattern}) && (${node[key][".validate"] || "true"})`,
  };
};
for (const index of [0, 1, 2, 3, 4]) state.players[index] = str(128);
state.players.$other = { ".validate": false };
for (const key of ["masks", "solved", "letters", "guesses", "guessCounts", "answers"])
  indexRule(state.boards.$uid[key], "$index", "/^([0-9]|10|11)$/");
indexRule(state.boards.$uid.guesses.$index, "$attempt", "/^([0-9]|[1-4][0-9])$/");
indexRule(state.hints, "$i", "/^[0-2]$/");
indexRule(state.attempts, "$i", "/^([0-9]|1[0-4])$/");
indexRule(rules.secrets.$slot.$uid.words, "$i", "/^([0-9]|10|11)$/");
rules.secrets.$slot.$uid.words[".validate"] =
  "newData.hasChildren(['0','1','2'])";
state.boards.$uid.masks[".validate"] = "newData.hasChildren(['0','1','2'])";
rules.rooms.$slot.ready.$uid[".validate"] +=
  ` && ${memberFor('$uid')}`;
rules.rooms.$slot.presence.$uid.$connection[".validate"] +=
  " && ($connection === '0' || $connection === '1' || $connection === '2')";
writeFileSync(
  new URL("../database.rules.json", import.meta.url),
  JSON.stringify({ rules }, null, 2) + "\n",
);
