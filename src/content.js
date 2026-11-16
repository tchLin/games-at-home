export const GAMES = {
  wheel: {name: 'Blind Wheel', tag: 'Get on the same wavelength', description: 'One secret spot. One perfect clue. How well can you read each other?', time: '5–10 min', color: 'peach'},
  chain: {name: 'Word by Word', tag: 'A little mystery, letter by letter', description: 'Make a secret word list. Trade guesses, uncover letters, and race to the last word.', time: '10–15 min', color: 'sage'},
  clues: {name: 'Three Little Clues', tag: 'Say a little. Guess a lot.', description: 'One hidden word and just three hints. Make every little word count.', time: '5–10 min', color: 'butter'},
};
export const TOPICS = [
  ['Ugly Pokémon', 'Pretty Pokémon'], ['Terrible date', 'Perfect date'], ['Underrated', 'Overrated'],
  ['Cozy', 'Chaotic'], ['Everyday luxury', 'Absolutely essential'], ['Terrible superpower', 'Amazing superpower'],
  ['Boring food', 'Exciting food'], ['Tiny adventure', 'Huge adventure'], ['Cold', 'Hot'],
  ['Easy to do', 'Hard to do'], ['Villain energy', 'Hero energy'], ['A little romantic', 'Very romantic'],
  ['Quiet evening', 'Wild night out'], ['Bad gift', 'Great gift'], ['Realistic dream', 'Impossible dream'],
];
export const WORDS = {
  Everyday: 'coffee blanket bicycle candle window notebook pillow garden umbrella kitchen sweater mirror postcard suitcase balloon camera ladder hammock key pocket basket button clock pencil ribbon envelope library train bridge lighthouse fountain backpack telescope compass puzzle lantern bookshelf teapot doormat headphones whistle mailbox curtain necklace ticket cabin elevator newspaper sidewalk scissors wallet airplane paintbrush'.split(' '),
  Food: 'pancake croissant avocado popcorn strawberry chocolate waffle cinnamon noodles pizza honey coconut lemon pumpkin biscuit sandwich cupcake dumpling pretzel mango cherry caramel cheese marshmallow sushi peach almond oatmeal raspberry gingerbread blueberry espresso donut cheesecake lemonade pistachio butter jelly toast watermelon pineapple garlic basil spaghetti mushroom cookie potato orange pear tomato'.split(' '),
  Nature: 'sunflower mountain ocean thunder forest rainbow river moonlight butterfly mushroom pebble waterfall snowflake cactus meadow firefly cloud sunset beach volcano glacier island feather seashell willow acorn pinecone lavender blossom jungle desert canyon snowstorm dolphin penguin otter fox rabbit turtle flamingo koala hedgehog dragonfly owl squirrel whale coral moss fern'.split(' '),
  Playful: 'dragon wizard astronaut treasure unicorn robot castle detective carnival mermaid pirate spaceship superhero dinosaur karaoke confetti daydream magic trampoline rollercoaster arcade adventure disco glitter origami stargazing picnic bowling cinema melody snowman firework fairytale festival comet meteor galaxy planet satellite rocket jigsaw charades badminton hopscotch hideaway sundae polaroid doodle'.split(' '),
};
export const DEFAULT_SETTINGS = {game: 'wheel', rounds: 6, timer: 0, wordCount: 5, guessesPerHint: 2, category: 'Everyday', topic: 'surprise', left: 'Ugly Pokémon', right: 'Pretty Pokémon', version: 1};
export function suggestions(category, count = 6, exclude = []) {
  const pool = [...(WORDS[category] || Object.values(WORDS).flat())].filter(w => !exclude.includes(w));
  for (let i = pool.length - 1; i > 0; i--) {const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];}
  return pool.slice(0, count);
}
