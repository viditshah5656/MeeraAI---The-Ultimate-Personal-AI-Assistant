/**
 * Agent Task Detection & Triggering System
 * Detects user intent and triggers appropriate agent actions
 */

export type AgentTaskType = "search" | "browse" | "book" | "shop" | "play" | "download";

export interface AgentTaskConfig {
  type: AgentTaskType;
  keywords: string[];
  patterns: RegExp[];
  generateUrl: (query: string) => string;
  title: (query: string) => string;
}

export const AGENT_TASK_CONFIGS: AgentTaskConfig[] = [
  {
    type: "book",
    keywords: ["hotel", "book", "booking", "airbnb", "accommodation", "stay", "reserve", "reservation"],
    patterns: [
      /(?:find|book|search|show|find me)(?:\s+(?:the|a|best|cheap|luxury))*\s+(?:hotel|accommodation|airbnb|place to stay)/i,
      /(?:hotel|accommodation)\s+(?:in|near|around|at)\s+(.+?)(?:\s+for|\s+from|\s+on|$)/i,
    ],
    generateUrl: (query) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${query} hotels booking airbnb`)}`,
    title: (query) => `Finding hotels in ${query}`,
  },
  {
    type: "shop",
    keywords: ["buy", "purchase", "shop", "amazon", "ebay", "product", "price", "compare"],
    patterns: [
      /(?:find|buy|search|show|compare)(?:\s+(?:the|a|best|cheap))*\s+(.+?)(?:\s+(?:price|cost|deal|online)|$)/i,
      /(?:where|how)\s+(?:can\s+)?(?:i|we)\s+(?:buy|get)\s+(.+?)(?:\s+(?:online|cheapest)|$)/i,
    ],
    generateUrl: (query) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${query} price online buy`)}`,
    title: (query) => `Shopping for ${query}`,
  },
  {
    type: "play",
    keywords: ["music", "play", "spotify", "song", "album", "artist", "listen", "podcast"],
    patterns: [
      /(?:play|listen to|find)(?:\s+(?:some|the|a|my))*\s+(.+?)(?:\s+(?:music|song|album|playlist)|$)/i,
      /(?:what|find)\s+(?:are some good|some)\s+(.+?)\s+(?:songs|music|artists)/i,
    ],
    generateUrl: (query) =>
      `https://www.spotify.com/search/${encodeURIComponent(query)}`,
    title: (query) => `Playing ${query}`,
  },
  {
    type: "browse",
    keywords: ["location", "address", "direction", "route", "map", "navigate", "where is", "how to get"],
    patterns: [
      /(?:where|location|address)\s+(?:is|of|for)\s+(.+?)(?:\s+(?:near|in)|$)/i,
      /(?:how|directions)\s+(?:to|from)\s+(.+?)(?:\s+(?:to|near)|$)/i,
    ],
    generateUrl: (query) =>
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`,
    title: (query) => `Routing to ${query}`,
  },
  {
    type: "download",
    keywords: ["download", "pdf", "book", "ebook", "document", "file", "get", "read"],
    patterns: [
      /(?:download|get|find)\s+(?:the|a|my)*\s+(.+?)\s+(?:pdf|ebook|book|document|file)/i,
      /where\s+(?:can\s+)?(?:i|we)\s+(?:download|get|read)\s+(.+?)(?:\s+(?:online|free)|$)/i,
    ],
    generateUrl: (query) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${query} pdf download ebook`)}`,
    title: (query) => `Finding ${query}`,
  },
  {
    type: "search",
    keywords: ["translate", "translation", "language", "meaning", "synonym", "define", "summary", "summarize", "rewrite"],
    patterns: [
      /translate(?:\s+from\s+[a-z]{2,})?(?:\s+to\s+[a-z]{2,})?\s+(.+)/i,
      /(?:what does|what is the meaning of|define|define the term)\s+(.+?)(?:\?|$)/i,
      /(?:summarize|summarise|summary of)\s+(.+?)(?:\?|$)/i,
    ],
    generateUrl: (query) =>
      `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(query)}&op=translate`,
    title: (query) => `Translating ${query}`,
  },
  {
    type: "search",
    keywords: ["similar", "compare", "browse", "internet", "web", "news", "latest", "current", "lookup", "search", "find", "what", "how", "tell", "information", "about"],
    patterns: [
      /(?:find|show|give me)\s+(?:something\s+)?similar\s+to\s+(.+?)(?:\?|$)/i,
      /(?:find|search|tell me|what|how)\s+(?:is|are|about|do)\s+(.+?)(?:\?|$)/i,
      /(?:i want|i need|i'm looking for|looking for)\s+(?:information|details|info)\s+(?:about|on)\s+(.+?)(?:\?|$)/i,
    ],
    generateUrl: (query) =>
      `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    title: (query) => `Searching for ${query}`,
  },
];

export function detectAgentTask(message: string): { config: AgentTaskConfig; query: string } | null {
  const lowerMessage = message.toLowerCase();

  // Try pattern matching first (more specific)
  for (const config of AGENT_TASK_CONFIGS) {
    for (const pattern of config.patterns) {
      const match = message.match(pattern);
      if (match) {
        const query = match[1] || message;
        return { config, query };
      }
    }
  }

  // Try keyword matching (fallback)
  for (const config of AGENT_TASK_CONFIGS) {
    if (config.keywords.some((keyword) => lowerMessage.includes(keyword))) {
      return { config, query: message };
    }
  }

  return null;
}

export function extractQueryFromMessage(message: string, config: AgentTaskConfig): string {
  // Try to extract specific query from patterns
  for (const pattern of config.patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Remove keywords and return remaining text
  let query = message;
  for (const keyword of config.keywords) {
    query = query.replace(new RegExp(keyword, "gi"), "").trim();
  }

  return query.trim() || message;
}
