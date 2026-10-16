/**
 * Sir Expiry Mascot Personality Engine for Pantry Rescue
 * Generates witty, theatrical, template-driven commentary reflecting fridge state.
 * Never mean, never shaming of individuals, always playfully dramatic.
 */

export type MascotMood = 'calm' | 'watchful' | 'worried' | 'panicked' | 'celebrating';

export interface MascotContext {
  expiredCount?: number;
  urgentCount?: number; // expiring today or tomorrow
  totalCount?: number;
  urgentItemName?: string;
  rescuedItemName?: string;
  streakWeeks?: number;
  userName?: string;
}

export interface MascotStatus {
  mood: MascotMood;
  title: string;
  quote: string;
  image: string; // Asset filename
}

const QUOTES_BY_MOOD: Record<MascotMood, string[]> = {
  calm: [
    "Ah, tranquility in the crisper drawer! Everything is in orderly harmony.",
    "Behold, a fridge of sublime dignity. Not a single lettuce leaf whimpering in the shadows.",
    "My monocle remains polished and unscratched. The provisions are secure!",
    "A spotless pantry is a happy pantry. Take a bow, culinary stewards.",
  ],
  watchful: [
    "I detect a subtle rumble of destiny in the produce bin. Let us keep our wits sharp.",
    "A few provisions are eyeing the calendar with gentle apprehension. A stir-fry looms on the horizon!",
    "Vigilance, dear household! Time waits for no bell pepper.",
    "The clock ticks with gentle persistency. Shall we plan tonight's dinner around our ripening guests?",
  ],
  worried: [
    "Hark! The {urgentItemName} approaches its fateful hour! Do not let it perish in silence!",
    "My heart palpitations quicken! We have {urgentCount} item(s) teetering on the edge of oblivion!",
    "Great dollops of Greek yogurt! The hour of dinner is nigh, and dinner must be swift!",
    "I clutch my pocket watch with trembling fingers! The crisper drawer calls for a champion!",
  ],
  panicked: [
    "THE CRISIS HAS ARRIVED! TO ARMS, CULINARY WARRIORS! SAVE THE FLAVOURS!",
    "O, cruel calendar! We have provisions stranded in the danger zone! Unleash the soup pots!",
    "My monocle has popped clean off! {urgentCount} urgent item(s) demand immediate culinary redemption!",
    "Emergency feast protocol activated! We shall turn tragedy into delicious triumph this very evening!",
  ],
  celebrating: [
    "HUZZAH! The {rescuedItemName} was rescued from the jaws of the bin! A culinary masterpiece!",
    "Magnificent! Another week of heroic waste reduction. The crisper sings your praises!",
    "Raise the wooden spoons high! {streakWeeks} weeks of glorious victory over food waste!",
    "A standing ovation from the butter compartment! That was nothing short of gastronomic heroism!",
  ],
};

/**
 * Determines Sir Expiry's mood based on fridge urgency levels
 */
export function determineMascotMood(
  urgentCount: number = 0,
  expiredCount: number = 0,
  totalCount: number = 0
): MascotMood {
  if (expiredCount > 0 || urgentCount >= 3) {
    return 'panicked';
  }
  if (urgentCount >= 1) {
    return 'worried';
  }
  if (totalCount > 0) {
    return 'watchful';
  }
  return 'calm';
}

/**
 * Returns a complete MascotStatus with tailored quote and mood asset
 */
export function getSirExpiryStatus(
  moodInput?: MascotMood,
  context: MascotContext = {}
): MascotStatus {
  const urgentCount = context.urgentCount ?? 0;
  const expiredCount = context.expiredCount ?? 0;
  const totalCount = context.totalCount ?? 0;

  const mood = moodInput || determineMascotMood(urgentCount, expiredCount, totalCount);

  const quotes = QUOTES_BY_MOOD[mood] || QUOTES_BY_MOOD.calm;
  const rawQuote = quotes[Math.floor(Math.random() * quotes.length)];

  // Inject template variables
  const quote = rawQuote
    .replace('{urgentItemName}', context.urgentItemName || 'perishable delight')
    .replace('{rescuedItemName}', context.rescuedItemName || 'provisions')
    .replace('{urgentCount}', String(Math.max(1, urgentCount + expiredCount)))
    .replace('{streakWeeks}', String(context.streakWeeks || 1));

  const moodTitles: Record<MascotMood, string> = {
    calm: 'Sir Expiry is Pleased',
    watchful: 'Sir Expiry is Keeping Watch',
    worried: 'Sir Expiry is Agitated',
    panicked: 'Sir Expiry is Theatrically Distressed!',
    celebrating: 'Sir Expiry Applauds!',
  };

  const moodImages: Record<MascotMood, string> = {
    calm: '/assets/sir_expiry_calm.png',
    watchful: '/assets/sir_expiry_calm.png',
    worried: '/assets/sir_expiry_worried.png',
    panicked: '/assets/sir_expiry_panicked.png',
    celebrating: '/assets/sir_expiry_calm.png',
  };

  return {
    mood,
    title: moodTitles[mood],
    quote,
    image: moodImages[mood],
  };
}
