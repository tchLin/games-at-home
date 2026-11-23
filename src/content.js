export const GAMES = {
  wheel: {
    name: "Blind Wheel",
    tag: "Get on the same wavelength",
    description:
      "One secret spot. One perfect clue. How well can you read each other?",
    time: "5–10 min",
    color: "peach",
  },
  chain: {
    name: "Word by Word",
    tag: "A little mystery, letter by letter",
    description:
      "Build a connected word chain. Follow the links, uncover letters, and race to the last word.",
    time: "10–15 min",
    color: "sage",
  },
  clues: {
    name: "Three Little Clues",
    tag: "Say a little. Guess a lot.",
    description:
      "One hidden word and just three hints. Make every little word count.",
    time: "5–10 min",
    color: "butter",
  },
  reverse: {
    name: "Backwards & Forwards",
    tag: "A little backwards. A lot of laughs.",
    description: "Copy a backwards word in one take. Flip your voice and let your person guess.",
    time: "5–10 min",
    color: "rose",
  },
};
export const WHEEL_TOPICS = {
  pokemon: {
    name: "Pokémon",
    pairs: [
      ["Ugly Pokémon", "Pretty Pokémon"],
      ["Weak Pokémon", "Powerful Pokémon"],
      ["Scary Pokémon", "Cute Pokémon"],
      ["Bad companion", "Great companion"],
      ["Common Pokémon", "Rare Pokémon"],
      ["Tiny Pokémon", "Huge Pokémon"],
      ["Slow Pokémon", "Fast Pokémon"],
      ["Forgettable", "Iconic"],
      ["Mischievous", "Well-behaved"],
      ["Fragile", "Tough"],
      ["Ordinary-looking", "Strange-looking"],
      ["Bad cuddle buddy", "Great cuddle buddy"],
      ["Would flee a fight", "Would start a fight"],
      ["Easy to train", "Hard to train"],
      ["Quiet Pokémon", "Noisy Pokémon"],
      ["Underrated", "Overrated"],
    ],
  },
  food: {
    name: "Food & drinks",
    pairs: [
      ["Bland", "Flavorful"],
      ["Everyday snack", "Special treat"],
      ["Comfort food", "Adventurous food"],
      ["Cold", "Hot"],
      ["Sweet", "Savory"],
      ["Light snack", "Heavy meal"],
      ["Mild", "Spicy"],
      ["Soft", "Crunchy"],
      ["Cheap", "Expensive"],
      ["Easy to make", "Hard to make"],
      ["Messy to eat", "Tidy to eat"],
      ["Healthy", "Indulgent"],
      ["Breakfast food", "Dinner food"],
      ["Bad leftovers", "Great leftovers"],
      ["Refreshing", "Warming"],
      ["Underrated", "Overrated"],
    ],
  },
  animals: {
    name: "Animals",
    pairs: [
      ["Scary", "Cute"],
      ["Slow", "Fast"],
      ["Tiny", "Huge"],
      ["Bad pet", "Great pet"],
      ["Quiet", "Noisy"],
      ["Solitary", "Social"],
      ["Clumsy", "Graceful"],
      ["Lazy", "Energetic"],
      ["Common", "Rare"],
      ["Gentle", "Fierce"],
      ["Simple-looking", "Unusual-looking"],
      ["Low maintenance", "High maintenance"],
      ["Bad swimmer", "Great swimmer"],
      ["Sneaky", "Easy to spot"],
      ["Would avoid a hug", "Would enjoy a hug"],
      ["Fragile", "Resilient"],
    ],
  },
  dates: {
    name: "Date ideas",
    pairs: [
      ["Terrible date", "Perfect date"],
      ["Relaxing", "Adventurous"],
      ["Budget friendly", "Expensive"],
      ["A little romantic", "Very romantic"],
      ["Spontaneous", "Needs planning"],
      ["Quiet", "Loud"],
      ["Indoors", "Outdoors"],
      ["Casual", "Fancy"],
      ["Short outing", "All-day adventure"],
      ["Predictable", "Surprising"],
      ["Awkward first date", "Great first date"],
      ["Rain would ruin it", "Great on a rainy day"],
      ["Low effort", "High effort"],
      ["Private", "Crowded"],
      ["Silly", "Serious"],
      ["Easy to forget", "Unforgettable"],
    ],
  },
  characters: {
    name: "Fictional characters",
    pairs: [
      ["Villain", "Hero"],
      ["Weak", "Powerful"],
      ["Chaotic", "Dependable"],
      ["Scary", "Lovable"],
      ["Selfish", "Generous"],
      ["Cowardly", "Brave"],
      ["Serious", "Funny"],
      ["Naive", "Wise"],
      ["Bad roommate", "Great roommate"],
      ["Forgettable", "Iconic"],
      ["Sneaky", "Honest"],
      ["Poor leader", "Great leader"],
      ["Calm", "Dramatic"],
      ["Bad style", "Great style"],
      ["Would lose a debate", "Would win a debate"],
      ["Underrated", "Overrated"],
    ],
  },
  everyday: {
    name: "Everyday things",
    pairs: [
      ["Useless", "Essential"],
      ["Boring", "Exciting"],
      ["Cheap", "Expensive"],
      ["Uncomfortable", "Cozy"],
      ["Fragile", "Durable"],
      ["Tiny", "Bulky"],
      ["Hard to use", "Easy to use"],
      ["Old-fashioned", "Futuristic"],
      ["Messy", "Neat"],
      ["Quiet", "Loud"],
      ["Bad gift", "Great gift"],
      ["Rarely used", "Used every day"],
      ["Easy to replace", "Irreplaceable"],
      ["Portable", "Hard to move"],
      ["Plain", "Beautiful"],
      ["Want", "Need"],
    ],
  },
};
export function wheelPrompt(config, seed, round) {
  if (config.topic === "custom")
    return { topicLabel: "Your topic", left: config.left, right: config.right };
  const topics = Object.values(WHEEL_TOPICS);
  const topic = Object.hasOwn(WHEEL_TOPICS, config.topic)
    ? WHEEL_TOPICS[config.topic]
    : topics[(seed + round - 1) % topics.length];
  const step = Object.hasOwn(WHEEL_TOPICS, config.topic)
    ? round - 1 : Math.floor((round - 1) / topics.length);
  const pair = topic.pairs[(Math.floor(seed / topics.length) + step) % topic.pairs.length];
  return { topicLabel: topic.name, left: pair[0], right: pair[1] };
}
export const WORDS = {
  Everyday:
    "coffee blanket bicycle candle window notebook pillow garden umbrella kitchen sweater mirror postcard suitcase balloon camera ladder hammock key pocket basket button clock pencil ribbon envelope library train bridge lighthouse fountain backpack telescope compass puzzle lantern bookshelf teapot doormat headphones whistle mailbox curtain necklace ticket cabin elevator newspaper sidewalk scissors wallet airplane paintbrush".split(
      " ",
    ),
  Food: "pancake croissant avocado popcorn strawberry chocolate waffle cinnamon noodles pizza honey coconut lemon pumpkin biscuit sandwich cupcake dumpling pretzel mango cherry caramel cheese marshmallow sushi peach almond oatmeal raspberry gingerbread blueberry espresso donut cheesecake lemonade pistachio butter jelly toast watermelon pineapple garlic basil spaghetti mushroom cookie potato orange pear tomato".split(
    " ",
  ),
  Nature:
    "sunflower mountain ocean thunder forest rainbow river moonlight butterfly mushroom pebble waterfall snowflake cactus meadow firefly cloud sunset beach volcano glacier island feather seashell willow acorn pinecone lavender blossom jungle desert canyon snowstorm dolphin penguin otter fox rabbit turtle flamingo koala hedgehog dragonfly owl squirrel whale coral moss fern".split(
      " ",
    ),
  Playful:
    "dragon wizard astronaut treasure unicorn robot castle detective carnival mermaid pirate spaceship superhero dinosaur karaoke confetti daydream magic trampoline rollercoaster arcade adventure disco glitter origami stargazing picnic bowling cinema melody snowman firework fairytale festival comet meteor galaxy planet satellite rocket jigsaw charades badminton hopscotch hideaway sundae polaroid doodle".split(
      " ",
    ),
};
// Topic-specific inspiration for Three Little Clues; players may type their own word.
Object.assign(WORDS, {
  Animals: "giraffe elephant tiger panda kangaroo zebra leopard hamster squirrel camel hedgehog rabbit otter koala sloth cheetah rhino gorilla bat wolf".split(" "),
  Ocean: "dolphin whale shark octopus jellyfish starfish seahorse coral lobster crab oyster squid seal walrus shrimp kelp turtle reef tide submarine".split(" "),
  Space: "planet galaxy comet astronaut rocket satellite meteor moon sun star telescope orbit asteroid eclipse gravity nebula spaceship alien crater universe".split(" "),
  Technology: "computer keyboard mouse screen robot drone camera battery printer router phone charger microphone speaker tablet browser password cable sensor circuit".split(" "),
  Sports: "soccer tennis basketball baseball volleyball swimming boxing skating surfing cycling golf bowling skiing fencing wrestling gymnastics badminton hockey archery rugby".split(" "),
  Music: "piano guitar violin trumpet drums flute cello harp singer orchestra concert melody rhythm chorus jazz opera microphone cymbal ukulele harmonica".split(" "),
  Travel: "passport suitcase airport hotel beach island ticket compass cruise hostel map backpack souvenir postcard journey cabin campsite luggage guide adventure".split(" "),
  Transport: "bicycle train airplane helicopter scooter ferry bus taxi subway tractor ambulance canoe skateboard motorcycle tram wagon rocket sailboat truck gondola".split(" "),
  Jobs: "teacher doctor firefighter baker chef pilot farmer detective artist dentist nurse scientist carpenter engineer plumber librarian astronaut musician mechanic architect".split(" "),
  Hobbies: "knitting painting gardening cooking hiking fishing photography reading dancing pottery origami camping sewing drawing chess puzzles yoga journaling embroidery baking".split(" "),
  Clothing: "sweater jacket scarf glove hat sock boot sneaker sandal belt dress skirt jeans cardigan apron helmet tie vest mitten swimsuit".split(" "),
  Kitchen: "spoon fork knife bowl plate oven stove kettle toaster blender whisk spatula colander saucepan mug refrigerator chopsticks grater ladle rollingpin".split(" "),
  Home: "sofa pillow blanket curtain bookshelf mirror carpet doorway chimney attic basement balcony shower bathtub lamp wardrobe mattress cupboard staircase fireplace".split(" "),
  Places: "library museum hospital school bakery theater stadium zoo aquarium airport harbor castle temple market playground lighthouse cafe park restaurant station".split(" "),
  Weather: "rain snow hail thunder lightning fog breeze tornado hurricane sunshine frost rainbow drought cloud blizzard drizzle wind humidity sleet monsoon".split(" "),
  Plants: "sunflower rose tulip daisy cactus fern bamboo willow oak maple lavender orchid moss ivy lily clover palm vine dandelion mint".split(" "),
  Feelings: "joy sadness anger surprise pride envy fear relief hope curiosity gratitude loneliness excitement boredom embarrassment confidence nostalgia anxiety calm love".split(" "),
  School: "pencil eraser notebook ruler chalk textbook backpack homework recess classroom lesson exam lunchbox scissors glue marker desk calculator crayon dictionary".split(" "),
  Fantasy: "dragon wizard unicorn mermaid fairy giant elf goblin witch troll phoenix griffin potion wand spell castle knight treasure enchanted sword".split(" "),
  Movies: "actor director camera popcorn cinema script costume stunt animation sequel trailer spotlight soundtrack villain hero credits premiere scene comedy mystery".split(" "),
  Science: "atom molecule magnet fossil volcano microscope experiment crystal energy chemistry gravity oxygen electricity biology dinosaur cell mineral prism friction evolution".split(" "),
  Body: "heart brain eye ear nose tongue tooth finger thumb elbow knee ankle shoulder spine muscle stomach skin bone lung wrist".split(" "),
});
export function clueTopic(config, seed, round) {
  const topics = Object.keys(WORDS);
  return config.category === "surprise"
    ? topics[(seed + round - 1) % topics.length]
    : Object.hasOwn(WORDS, config.category) ? config.category : "Everyday";
}
export const DEFAULT_SETTINGS = {
  game: "wheel",
  rounds: 6,
  timer: 0,
  wordCount: 5,
  guessesPerHint: 2,
  reverseSyllables: 1,
  category: "Everyday",
  topic: "surprise",
  left: "Ugly Pokémon",
  right: "Pretty Pokémon",
  version: 1,
};
export function suggestions(category, count = 6, exclude = []) {
  const pool = [...(WORDS[category] || Object.values(WORDS).flat())].filter(
    (w) => !exclude.includes(w),
  );
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
