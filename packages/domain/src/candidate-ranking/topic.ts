/**
 * Deterministic topic classification for story clusters.
 *
 * Maps story clusters into one of the 8 canonical TopicSlug categories
 * based on headline tokens, item descriptions, and source tags.
 */

import type { TopicSlug } from "@aaj-bas/schemas";
import type { StoryCluster } from "../clustering";
import { tokenizeTitle } from "../deduplication";

const TOPIC_KEYWORDS: Record<TopicSlug, readonly string[]> = {
  "business-economy": [
    "sensex",
    "nifty",
    "market",
    "markets",
    "inflation",
    "gdp",
    "rbi",
    "repo",
    "rate",
    "stocks",
    "shares",
    "bank",
    "banks",
    "banking",
    "fiscal",
    "trade",
    "tax",
    "gst",
    "rupee",
    "startup",
    "investment",
    "profit",
    "revenue",
    "economy",
    "economic",
    "bse",
    "nse",
    "gold",
    "crude",
    "sebi",
  ],
  "science-health-climate": [
    "isro",
    "space",
    "satellite",
    "nasa",
    "health",
    "disease",
    "vaccine",
    "hospital",
    "medical",
    "virus",
    "climate",
    "weather",
    "cyclone",
    "monsoon",
    "pollution",
    "emission",
    "species",
    "environment",
    "cancer",
    "aiims",
    "research",
    "scientists",
    "drdo",
  ],
  "technology-ai": [
    "ai",
    "software",
    "chip",
    "chips",
    "semiconductor",
    "cyber",
    "hacker",
    "google",
    "microsoft",
    "apple",
    "openai",
    "tech",
    "technology",
    "smartphone",
    "app",
    "telecom",
    "5g",
    "computing",
    "robotics",
    "meta",
  ],
  sports: [
    "cricket",
    "bcci",
    "ipl",
    "test",
    "match",
    "football",
    "fifa",
    "olympics",
    "badminton",
    "tennis",
    "hockey",
    "chess",
    "medal",
    "tournament",
    "championship",
    "wrestler",
    "wrestling",
    "goal",
  ],
  "culture-entertainment": [
    "film",
    "movie",
    "cinema",
    "actor",
    "actress",
    "bollywood",
    "hollywood",
    "music",
    "artist",
    "art",
    "museum",
    "festival",
    "dance",
    "theatre",
    "book",
    "literature",
    "award",
    "awards",
    "oscar",
    "ott",
  ],
  "policy-geopolitics": [
    "summit",
    "treaty",
    "diplomacy",
    "bilateral",
    "foreign",
    "embassy",
    "sanctions",
    "nato",
    "geopolitics",
    "war",
    "conflict",
    "border",
    "security",
    "pact",
    "accord",
    "g20",
    "brics",
  ],
  india: [
    "parliament",
    "lok sabha",
    "rajya sabha",
    "supreme court",
    "high court",
    "cabinet",
    "bjp",
    "congress",
    "election",
    "delhi",
    "mumbai",
    "police",
    "cm",
    "governor",
    "bill",
    "act",
    "scheme",
    "modi",
  ],
  world: [
    "global",
    "international",
    "un",
    "us",
    "china",
    "russia",
    "ukraine",
    "europe",
    "asia",
    "president",
  ],
};

export function classifyStoryTopic(cluster: StoryCluster): TopicSlug {
  const titleTokens = tokenizeTitle(cluster.representativeTitle);

  // Tokenize descriptions as additional context
  const descriptionText = cluster.items
    .map((i) => i.description)
    .filter(Boolean)
    .join(" ");
  const descTokens = tokenizeTitle(descriptionText);

  let bestTopic: TopicSlug = "india";
  let maxScore = -1;

  // Evaluate each topic
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS) as [
    TopicSlug,
    readonly string[],
  ][]) {
    let score = 0;
    for (const kw of keywords) {
      if (titleTokens.unigrams.has(kw) || titleTokens.bigrams.has(kw)) {
        score += 3;
      } else if (descTokens.unigrams.has(kw) || descTokens.bigrams.has(kw)) {
        score += 1;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestTopic = topic;
    }
  }

  // If no strong keyword matches found, default to general national coverage
  if (maxScore <= 0) {
    return "india";
  }

  return bestTopic;
}
