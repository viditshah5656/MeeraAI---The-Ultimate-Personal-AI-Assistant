/**
 * dynamicGreeting.ts
 * 
 * Autonomous, smart greeting & internet-driven inspiration engine for MeeraAI.
 * - Dynamic, non-repetitive user nicknames for non-logged-in sessions (replaces hardcoded "Vidit")
 * - Smart time-of-day & day-of-week context greetings with emojis
 * - Background internet quote fetcher with offline caching and seamless fallbacks
 * - Zero LLM latency: 100% autonomous frontend engine
 */

export interface DailyThought {
  text: string;
  author: string;
  source: "internet" | "cached" | "curated";
}

const STORAGE_GREETING_QUOTE = "meera.dynamicGreetingQuote";
const STORAGE_GREETING_TIMESTAMP = "meera.dynamicGreetingTimestamp";
const QUOTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── Curated Offline Fallback Quote Bank ──────────────────────────────────────
const CURATED_QUOTES: Array<{ text: string; author: string }> = [
  { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { text: "Creativity is intelligence having fun.", author: "Albert Einstein" },
  { text: "Code is like humor. When you have to explain it, it’s bad.", author: "Cory House" },
  { text: "Small steps every day lead to gigantic leaps over time.", author: "Unknown" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Technology is best when it brings people together.", author: "Matt Mullenweg" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
  { text: "Knowledge is power, but curiosity is the spark.", author: "Carl Sagan" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "Great things are done by a series of small things brought together.", author: "Vincent van Gogh" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "Every great developer you know got there by solving problems they were unqualified to solve until they did it.", author: "Patrick McKenzie" },
  { text: "It always seems impossible until it is done.", author: "Nelson Mandela" },
  { text: "Stay curious, stay inspired, keep building.", author: "Meera AI" },
];

// ── Friendly Monikers for Unauthenticated / Guest Users ─────────────────────
const DYNAMIC_NICKNAMES = [
  "friend",
  "creator",
  "architect",
  "innovator",
  "voyager",
  "champion",
  "explorer",
  "visionary",
  "pal",
  "builder",
  "trailblazer",
  "dreamer",
  "maverick",
  "pathfinder",
  "thinker",
  "collaborator",
];

/**
 * Returns a dynamic friendly nickname for non-authenticated users.
 * Rotates based on day and hour so it feels fresh yet stable during a session.
 */
export function getDynamicAnonymousName(): string {
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const hour = now.getHours();
  const index = (dayOfYear * 7 + Math.floor(hour / 4)) % DYNAMIC_NICKNAMES.length;
  return DYNAMIC_NICKNAMES[index];
}

/**
 * Returns a smart, context-aware greeting string with time of day.
 */
export function getSmartTimeGreeting(): string {
  const now = new Date();
  const hour = now.getHours();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);

  // Late night (12 AM - 4:59 AM)
  if (hour >= 0 && hour < 5) {
    const nightPool = [
      "Burning the midnight oil",
      "Night owl mode",
      "Peaceful late night",
      "Deep thoughts at night",
    ];
    return nightPool[dayOfYear % nightPool.length];
  }

  // Early Morning / Morning (5 AM - 11:59 AM)
  if (hour < 12) {
    const morningPool = [
      "Good morning",
      "Rise and shine",
      "Top of the morning",
      "A bright morning to you",
      "Fresh start to the day",
    ];
    return morningPool[dayOfYear % morningPool.length];
  }

  // Afternoon (12 PM - 4:59 PM)
  if (hour < 17) {
    const afternoonPool = [
      "Good afternoon",
      "Hope your day is flowing well",
      "Productive afternoon vibes",
      "Good day",
    ];
    return afternoonPool[dayOfYear % afternoonPool.length];
  }

  // Golden Hour / Early Evening (5 PM - 7:59 PM)
  if (hour < 20) {
    const eveningPool = [
      "Good evening",
      "Golden hour vibes",
      "Winding down nicely",
      "Hope you had a great day",
    ];
    return eveningPool[dayOfYear % eveningPool.length];
  }

  // Night (8 PM - 11:59 PM)
  const nightPool = [
    "Good evening",
    "Relaxed evening vibes",
    "Time to create something cool",
    "Peaceful night",
  ];
  return nightPool[dayOfYear % nightPool.length];
}

/**
 * Fetches an inspiring daily thought from the internet, caching it locally in localStorage.
 * If offline or blocked, gracefully returns a curated thought from the local bank.
 */
export async function fetchInternetDailyThought(): Promise<DailyThought> {
  // Check cached thought
  try {
    const cached = localStorage.getItem(STORAGE_GREETING_QUOTE);
    const tsStr = localStorage.getItem(STORAGE_GREETING_TIMESTAMP);
    if (cached && tsStr) {
      const ts = Number(tsStr);
      if (!isNaN(ts) && Date.now() - ts < QUOTE_CACHE_TTL_MS) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.text) {
          return { text: parsed.text, author: parsed.author || "Inspiring Thought", source: "cached" };
        }
      }
    }
  } catch {
    // ignore cache read error
  }

  // Fetch from internet: try DummyJSON quotes API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch("https://dummyjson.com/quotes/random", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.quote) {
        const thought: DailyThought = {
          text: data.quote,
          author: data.author || "Unknown",
          source: "internet",
        };
        try {
          localStorage.setItem(STORAGE_GREETING_QUOTE, JSON.stringify(thought));
          localStorage.setItem(STORAGE_GREETING_TIMESTAMP, String(Date.now()));
        } catch {}
        return thought;
      }
    }
  } catch {
    // network or abort failure, fallback to curated
  }

  // Fallback to local curated bank
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const picked = CURATED_QUOTES[dayOfYear % CURATED_QUOTES.length];
  return {
    text: picked.text,
    author: picked.author,
    source: "curated",
  };
}
