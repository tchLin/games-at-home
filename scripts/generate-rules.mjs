import { writeFileSync } from "node:fs";
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
const member = `(${host} || ${meta}.child('guest').val() === auth.uid)`;
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
      "newData.val() === 'wheel' || newData.val() === 'chain' || newData.val() === 'clues'",
  },
  rounds: num(1, 20),
  timer: num(0, 300),
  wordCount: num(3, 12),
  guessesPerHint: num(1, 5),
  category: str(30),
  topic: str(20),
  left: str(60),
  right: str(60),
  version: num(1, 1e15),
  $other: { ".validate": false },
};
const state = {
  ".read": read,
  ".write": `${write} && (${host} || (data.exists() && newData.child('id').val() === data.child('id').val() && newData.child('game').val() === data.child('game').val() && newData.child('round').val() === data.child('round').val()))`,
  ".validate":
    "newData.hasChildren(['id','game','phase','config','round','players','scores','revision']) && newData.numChildren() <= 25",
  id: str(50),
  game: str(10),
  phase: {
    ".validate":
      "newData.val() === 'prepare' || newData.val() === 'clue' || newData.val() === 'guess' || newData.val() === 'pending' || newData.val() === 'reveal' || newData.val() === 'setup' || newData.val() === 'hint' || newData.val() === 'finished'",
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
  players: {
    ".validate": `newData.numChildren() === 2 && newData.child('0').val() === ${meta}.child('host').val() && newData.child('1').val() === ${meta}.child('guest').val()`,
  },
  scores: {
    ".validate": "newData.numChildren() === 2",
    $uid: {
      ".validate": `($uid === ${meta}.child('host').val() || $uid === ${meta}.child('guest').val()) && newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000`,
    },
  },
  boards: {
    ".validate": "newData.numChildren() <= 2",
    $uid: {
      ".validate": `($uid === ${meta}.child('host').val() || $uid === ${meta}.child('guest').val()) && newData.hasChild('masks')`,
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
          ".validate": `($uid === ${meta}.child('host').val() || $uid === ${meta}.child('guest').val()) && newData.hasChild('name')`,
          name: str(24),
          $other: { ".validate": false },
        },
      },
      ready: {
        ".read": read,
        ".write": `${write} && ${host}`,
        ".validate": "newData.numChildren() <= 2",
        $uid: { ".write": `${write} && auth.uid === $uid`, ...num(1, 1e15) },
      },
      presence: {
        ".read": read,
        ".write": `${write} && ${host} && !newData.exists()`,
        ".validate": "newData.numChildren() <= 2",
        $uid: {
          ".write": `${read} && auth.uid === $uid`,
          ".validate": `($uid === ${meta}.child('host').val() || $uid === ${meta}.child('guest').val()) && newData.numChildren() <= 3`,
          $connection: { ".validate": "newData.val() === true" },
        },
      },
      state,
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
};
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
state.players["0"] = str(128);
state.players["1"] = str(128);
state.players.$other = { ".validate": false };
for (const key of ["masks", "solved", "letters"])
  indexRule(state.boards.$uid[key], "$index", "/^([0-9]|10|11)$/");
indexRule(state.hints, "$i", "/^[0-2]$/");
indexRule(state.attempts, "$i", "/^([0-9]|1[0-4])$/");
indexRule(rules.secrets.$slot.$uid.words, "$i", "/^([0-9]|10|11)$/");
rules.secrets.$slot.$uid.words[".validate"] =
  "newData.hasChildren(['0','1','2'])";
state.boards.$uid.masks[".validate"] = "newData.hasChildren(['0','1','2'])";
rules.rooms.$slot.ready.$uid[".validate"] +=
  ` && ($uid === ${meta}.child('host').val() || $uid === ${meta}.child('guest').val())`;
rules.rooms.$slot.presence.$uid.$connection[".validate"] +=
  " && ($connection === '0' || $connection === '1' || $connection === '2')";
writeFileSync(
  new URL("../database.rules.json", import.meta.url),
  JSON.stringify({ rules }, null, 2) + "\n",
);
