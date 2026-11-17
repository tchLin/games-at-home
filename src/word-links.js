// Hand-curated phrase/compound continuations. Suggestions are optional: players
// can use any words and explain their connections to each other on the call.
const pairs = {
  coffee: 'shop bean cup table maker break cake pot grounds house',
  cafe: 'coffee tea pastry espresso table menu',
  espresso: 'coffee cup machine shot',
  barista: 'coffee cafe apron',
  shop: 'window keeper assistant floor lifting front',
  lifting: 'weights equipment truck',
  truck: 'driver stop load bed',
  window: 'shopping pane sill seat frame cleaner',
  shopping: 'cart bag mall list basket center',
  cart: 'wheel horse',
  wheel: 'chair barrow house spin',
  chair: 'lift leg back cushion person',
  lift: 'off gate ticket operator',
  off: 'shore road season switch',
  road: 'trip map work block sign runner',
  trip: 'wire advisor planner',
  map: 'maker reader pin',
  work: 'shop book day place load',
  book: 'shop shelf club mark case worm cover keeper',
  shelf: 'life space bracket',
  life: 'guard boat time saver jacket cycle coach',
  guard: 'dog rail house duty',
  dog: 'house park food walker collar show bowl',
  house: 'boat plant work party keeper cat',
  boat: 'house race yard load trip',
  plant: 'pot food nursery life',
  pot: 'hole luck roast holder',
  hole: 'punch cover',
  punch: 'line bowl bag card',
  line: 'dance cook graph break up',
  dance: 'floor hall partner class music',
  floor: 'board plan lamp mat show',
  board: 'game room walk meeting',
  game: 'night plan show keeper changer',
  night: 'light club shift owl sky time gown',
  light: 'house bulb switch year show',
  bulb: 'holder socket',
  switch: 'board blade',
  year: 'book end round',
  club: 'house sandwich soda member',
  sandwich: 'shop board maker filling',
  soda: 'water fountain bread',
  water: 'fall bottle melon proof color park slide front wheel',
  fall: 'out season',
  bottle: 'cap opener neck bank',
  cap: 'stone gun size',
  stone: 'wall age fruit cold',
  wall: 'paper flower clock art',
  paper: 'clip plane bag back weight cut mill',
  clip: 'board art',
  plane: 'ticket crash tree',
  ticket: 'office booth holder',
  office: 'chair space party worker hours',
  space: 'ship station suit craft bar',
  ship: 'yard wreck captain builder',
  station: 'master wagon house',
  suit: 'case jacket',
  case: 'study file worker',
  study: 'group hall guide',
  group: 'chat photo work',
  chat: 'room show bot',
  room: 'mate service key temperature',
  mate: 'tea',
  tea: 'cup pot bag party time spoon cake leaf',
  cup: 'cake board holder final',
  cake: 'walk stand pop mix shop',
  walk: 'way out',
  way: 'out side',
  out: 'side door fit',
  side: 'walk kick dish car',
  kick: 'ball start stand',
  ball: 'room game park point bearing',
  park: 'bench ranger land',
  bench: 'press mark seat',
  press: 'conference release room',
  conference: 'call room table',
  call: 'center sign back',
  center: 'piece stage field',
  piece: 'work meal',
  meal: 'time plan prep',
  time: 'table keeper line zone piece machine',
  table: 'cloth tennis top spoon manners',
  tennis: 'ball court racket shoe',
  court: 'house room yard',
  yard: 'sale stick work',
  sale: 'price sign',
  price: 'tag list war',
  tag: 'team line',
  team: 'work mate spirit player',
  spirit: 'animal level',
  animal: 'shelter kingdom lover',
  shelter: 'dog belt',
  king: 'size fisher pin',
  queen: 'bee size',
  bee: 'hive keeper sting wax',
  honey: 'bee moon comb pot',
  moon: 'light walk stone cake',
  sun: 'flower light shine rise set screen',
  flower: 'pot bed shop power girl',
  bed: 'room time sheet spread bug',
  sheet: 'music metal cake',
  music: 'box room teacher festival video',
  box: 'office car set cutter',
  car: 'park wash door seat pool pet',
  wash: 'cloth room board day',
  door: 'bell mat knob way step',
  bell: 'tower pepper curve',
  tower: 'block bridge crane',
  block: 'party chain buster',
  chain: 'reaction mail link saw',
  reaction: 'time video',
  mail: 'box bag carrier order',
  link: 'up',
  saw: 'dust blade mill',
  dust: 'pan jacket storm',
  pan: 'cake handle',
  handle: 'bar grip',
  bar: 'code stool tender bell',
  code: 'word name breaker',
  word: 'play search game book',
  play: 'ground room time date',
  ground: 'floor coffee work',
  date: 'night palm',
  palm: 'tree oil reader',
  tree: 'house top bark trunk',
  top: 'hat secret floor',
  hat: 'trick stand box',
  trick: 'question shot',
  question: 'mark time',
  mark: 'up down',
  up: 'town hill stairs',
  down: 'town hill stairs',
  town: 'hall house square',
  hall: 'way pass monitor',
  pass: 'word port book',
  port: 'hole side wine',
  wine: 'glass bottle cellar bar',
  glass: 'house blower ceiling',
  ceiling: 'fan light',
  fan: 'club mail belt base',
  belt: 'buckle loop',
  loop: 'hole road',
  ice: 'cream cube skate rink berg breaker',
  cream: 'cheese puff soda pie',
  cheese: 'cake burger board spread',
  burger: 'bun joint king',
  joint: 'venture account',
  account: 'book holder number',
  number: 'plate line game',
  plate: 'glass rack',
  rack: 'railway space',
  railway: 'station track bridge',
  train: 'station track ticket driver ride',
  track: 'suit meet record',
  record: 'player shop label',
  player: 'piano coach',
  piano: 'key lesson bench',
  key: 'board ring chain hole',
  ring: 'tone finger leader',
  finger: 'print food nail',
  print: 'shop maker',
  food: 'truck court bank chain fight',
  bank: 'account note holiday teller',
  note: 'book pad card',
  pad: 'lock thai',
  lock: 'smith down screen',
  screen: 'door shot time saver',
  shot: 'gun glass',
  gun: 'powder shot boat',
  powder: 'room puff snow',
  snow: 'ball man flake storm board',
  man: 'hole power kind',
  power: 'house plant bank station line',
  storm: 'cloud drain door',
  cloud: 'cover computing burst',
  cover: 'letter story girl',
  letter: 'box head opener',
  head: 'light phones band ache board',
  band: 'stand mate leader',
  stand: 'up out',
  heart: 'beat break burn ache',
  beat: 'box down',
  break: 'fast room time dance',
  fast: 'food lane track',
  lane: 'change closure',
  change: 'over maker',
  over: 'coat night time',
  coat: 'hanger rack pocket',
  pocket: 'watch book knife money',
  watch: 'dog tower maker',
  money: 'bag box tree order',
  order: 'form book',
  form: 'letter',
  fire: 'truck fighter place work fly wood',
  place: 'mat holder',
  fly: 'paper trap fishing',
  fishing: 'rod boat line net',
  rod: 'holder',
  net: 'work ball worth',
  wood: 'work land pecker',
  land: 'mark slide owner',
  slide: 'show rule',
  show: 'time case room stopper',
  cat: 'fish nap food flap',
  fish: 'tank bowl cake market finger',
  tank: 'top engine',
  market: 'place square stall',
  square: 'dance root meal',
  root: 'beer canal vegetable',
  beer: 'garden bottle mug',
  garden: 'gate party hose shed',
  gate: 'keeper way post',
  post: 'office card box',
  card: 'board game holder trick',
  rain: 'bow coat drop forest check',
  bow: 'tie string',
  tie: 'breaker pin',
  pin: 'ball cushion point',
  point: 'guard blank',
  drop: 'kick off',
  forest: 'fire floor ranger',
  check: 'book list mate',
  list: 'price',
  beach: 'ball house towel',
  towel: 'rack rail',
  rail: 'road way',
  river: 'bank bed boat',
  sea: 'shell horse food shore',
  shell: 'fish shock',
  horse: 'shoe power back race',
  shoe: 'lace box shop maker',
  lace: 'work',
  back: 'pack yard bone ground',
  pack: 'horse ice',
  bone: 'marrow china',
  race: 'car horse track course',
  course: 'work book',
  school: 'bus bag book house yard',
  bus: 'stop driver station',
  stop: 'watch sign light',
  sign: 'post language board',
  language: 'school teacher',
  apple: 'pie tree sauce juice',
  pie: 'crust chart shop',
  sauce: 'pan boat',
  juice: 'bar box',
  orange: 'juice peel tree',
  lemon: 'tea juice grass',
  grass: 'hopper roots skirt',
  hopper: 'car',
  hot: 'dog chocolate sauce air',
  chocolate: 'bar cake chip milk',
  chip: 'shop board',
  milk: 'shake bottle man',
  shake: 'down up',
  air: 'plane port line bag conditioner',
  butter: 'fly milk cup',
  bread: 'basket board crumb winner',
  basket: 'ball case',
  peanut: 'butter oil shell',
  oil: 'paint lamp field spill',
  paint: 'brush job shop',
  brush: 'fire stroke',
  job: 'interview title',
  interview: 'question panel',
  phone: 'book call case number',
  computer: 'game mouse screen science',
  mouse: 'pad trap',
  trap: 'door',
  science: 'fiction fair class',
  fiction: 'writer book',
  fair: 'ground play',
  class: 'room mate work',
  birth: 'day place mark',
  day: 'dream light care break',
  dream: 'catcher job land',
  care: 'giver taker home',
  home: 'work town land page',
  page: 'turner number',
};
const key = (word) => String(word || '').trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Forward phrase continuations rank first. Reverse links also make useful
// associations (bean → coffee), extending coverage without a model or network.
const graph = new Map();
function link(from, to, weight) {
  if (!graph.has(from)) graph.set(from, new Map());
  const neighbors = graph.get(from);
  neighbors.set(to, Math.max(weight, neighbors.get(to) || 0));
}
for (const [from, words] of Object.entries(pairs)) {
  for (const to of words.split(' ')) {
    link(from, to, 2);
    link(to, from, 1);
  }
}
const vocabulary = [...graph.keys()];
const irregular = new Map([
  ['children', 'child'], ['feet', 'foot'], ['teeth', 'tooth'],
  ['mice', 'mouse'], ['geese', 'goose'], ['men', 'man'], ['women', 'woman'],
  ['leaves', 'leaf'], ['knives', 'knife'], ['shelves', 'shelf'],
]);
function forms(word) {
  const result = [word];
  if (irregular.has(word)) result.push(irregular.get(word));
  if (word.endsWith('ies')) result.push(word.slice(0, -3) + 'y');
  if (/(ches|shes|xes|zes|sses)$/.test(word)) result.push(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) result.push(word.slice(0, -1));
  return result;
}

// Bounded Damerau-Levenshtein: insertion, deletion, replacement, or an adjacent
// transposition. Small typed buffers and a fixed vocabulary bound the work.
function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let beforePrevious;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
    }
    if (Math.min(...row) > limit) return limit + 1;
    beforePrevious = previous;
    previous = row;
  }
  return previous[b.length];
}
function matchWords(word) {
  if (Object.hasOwn(pairs, word)) return [{ word, kind: 'exact', score: 100 }];
  const variants = forms(word);
  const base = variants.slice(1).find((candidate) => graph.has(candidate));
  if (base) return [{ word: base, kind: 'plural', score: 95 }];
  if (graph.has(word)) return [{ word, kind: 'exact', score: 100 }];
  if (word.length < 3) return [];
  const completions = vocabulary.filter((candidate) => candidate.startsWith(word))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  if (completions.length)
    return completions.slice(0, 3).map((candidate) => ({ word: candidate, kind: 'partial', score: 90 }));
  const limit = word.length >= 6 ? 2 : 1;
  return vocabulary.map((candidate) => {
    const edits = Math.min(...variants.map((variant) => distance(variant, candidate, limit)));
    return { word: candidate, kind: 'typo', edits, score: 80 - edits * 10 };
  }).filter((candidate) => candidate.edits <= limit)
    .sort((a, b) => a.edits - b.edits || a.word.localeCompare(b.word)).slice(0, 3);
}

export function wordSuggestions(previous, exclude = [], prefix = '') {
  const word = key(previous);
  // Ignore inputs outside the small English word index; custom words still play.
  if (!/^[a-z]{1,40}$/.test(word)) return { matches: [], ideas: [] };
  const matches = matchWords(word);
  const used = new Set(exclude.flatMap((value) => forms(key(value))));
  used.add(word);
  matches.forEach((match) => used.add(match.word));
  const ranked = new Map();
  for (const match of matches) {
    for (const [candidate, weight] of graph.get(match.word)) {
      if (used.has(candidate) || !candidate.startsWith(key(prefix))) continue;
      const score = match.score + weight * 5;
      if (score > (ranked.get(candidate) ?? -1)) ranked.set(candidate, score);
    }
  }
  const ideas = [...ranked].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([candidate]) => candidate);
  return { matches, ideas };
}
export const nextWordIdeas = (previous, exclude = [], prefix = '') =>
  wordSuggestions(previous, exclude, prefix).ideas;
