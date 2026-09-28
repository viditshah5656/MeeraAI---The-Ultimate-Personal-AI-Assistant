export type SmartHomeSuggestion = {
  label: string;
  prompt: string;
};

type HackerNewsHit = {
  title?: string | null;
  story_title?: string | null;
};

type HackerNewsResponse = {
  hits?: HackerNewsHit[];
};

const CACHE_KEY = "meera.smartHomeSuggestions";
const CACHE_TIME_KEY = "meera.smartHomeSuggestionsTimestamp";
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4500;

const ACTIONS = [
  (topic: string) => ({
    label: `Brief me on ${topic}`,
    prompt: `Search the web for the latest reliable information about "${topic}". Give me a concise briefing with what happened, why it matters, and source links.`,
  }),
  (topic: string) => ({
    label: `Explain ${topic}`,
    prompt: `Research "${topic}" on the web and explain it clearly. Separate verified facts from interpretation and include credible source links.`,
  }),
  (topic: string) => ({
    label: `${topic}: impact`,
    prompt: `Use current web sources to analyze the practical impact of "${topic}". Cover who is affected, opportunities, risks, and what to watch next.`,
  }),
  (topic: string) => ({
    label: `Verify ${topic}`,
    prompt: `Fact-check the current reporting about "${topic}" using multiple credible web sources. Summarize what is confirmed, disputed, or still unknown.`,
  }),
  (topic: string) => ({
    label: `${topic}: what's next`,
    prompt: `Research the latest developments around "${topic}" and give me an evidence-based outlook with likely next steps and source links.`,
  }),
] as const;

const cleanTopic = (rawTitle: string): string => {
  const withoutSource = rawTitle.replace(/\s+[|\-]\s+[^|\-]{2,32}$/, "").trim();
  const compact = withoutSource.replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  if (compact.length <= 34) {
    return compact;
  }
  const shortened = compact.slice(0, 34).replace(/\s+\S*$/, "").trim();
  return shortened || compact.slice(0, 34).trim();
};

const readCachedSuggestions = (): SmartHomeSuggestion[] => {
  try {
    const cachedAt = Number(localStorage.getItem(CACHE_TIME_KEY) || "0");
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    if (Date.now() - cachedAt < CACHE_TTL_MS && Array.isArray(cached) && cached.length >= 5) {
      return cached.filter((item) => typeof item?.label === "string" && typeof item?.prompt === "string");
    }
  } catch {
    // A stale or unavailable cache should never block the home screen.
  }
  return [];
};

export async function fetchSmartHomeSuggestions(): Promise<SmartHomeSuggestion[]> {
  const cached = readCachedSuggestions();
  if (cached.length >= 5) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20", {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as HackerNewsResponse;
    const seen = new Set<string>();
    const topics = (data.hits || [])
      .map((hit) => cleanTopic(String(hit.title || hit.story_title || "")))
      .filter((topic) => {
        const key = topic.toLocaleLowerCase();
        if (topic.length < 5 || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 15);

    const suggestions = topics.map((topic, index) => ACTIONS[index % ACTIONS.length](topic));
    if (suggestions.length >= 5) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(suggestions));
        localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
      } catch {}
      return suggestions;
    }
  } catch {
    // The caller supplies a curated capability-safe fallback while offline.
  } finally {
    window.clearTimeout(timeoutId);
  }
  return [];
}
