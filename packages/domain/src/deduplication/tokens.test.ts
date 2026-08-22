import { describe, expect, it } from "vitest";
import { cleanTitle, tokenizeTitle } from "./tokens";

describe("tokenizeTitle and cleanTitle", () => {
  it("strips common news prefixes", () => {
    expect(cleanTitle("LIVE: Sensex crashes 500 points")).toBe(
      "Sensex crashes 500 points",
    );
    expect(cleanTitle("Breaking News: ISRO launches satellite")).toBe(
      "ISRO launches satellite",
    );
    expect(cleanTitle("[Video] Supreme court hearing begins")).toBe(
      "Supreme court hearing begins",
    );
    expect(cleanTitle("Explainer: What is the new IT rule")).toBe(
      "What is the new IT rule",
    );
  });

  it("strips trailing publisher attribution", () => {
    expect(cleanTitle("Inflation slows down in July - The Hindu")).toBe(
      "Inflation slows down in July",
    );
    expect(cleanTitle("Markets rally on rate cut hopes | NDTV")).toBe(
      "Markets rally on rate cut hopes",
    );
    expect(cleanTitle("Heavy rain alert for Mumbai - Indian Express")).toBe(
      "Heavy rain alert for Mumbai",
    );
  });

  it("extracts significant unigrams while filtering stop words", () => {
    const tokens = tokenizeTitle("A new report on the Indian economy in 2026");
    expect(tokens.significantTokens).toEqual([
      "report",
      "indian",
      "economy",
      "2026",
    ]);
    expect(tokens.unigrams.has("a")).toBe(false);
    expect(tokens.unigrams.has("the")).toBe(false);
    expect(tokens.unigrams.has("in")).toBe(false);
    expect(tokens.unigrams.has("on")).toBe(false);
    expect(tokens.unigrams.has("report")).toBe(true);
    expect(tokens.unigrams.has("indian")).toBe(true);
    expect(tokens.unigrams.has("economy")).toBe(true);
    expect(tokens.unigrams.has("2026")).toBe(true);
  });

  it("strictly preserves polarity and negation words", () => {
    const tokens = tokenizeTitle(
      "Court rejects bail petition, bans accused from leaving state",
    );
    expect(tokens.unigrams.has("rejects")).toBe(true);
    expect(tokens.unigrams.has("bans")).toBe(true);
    expect(tokens.unigrams.has("bail")).toBe(true);
    expect(tokens.unigrams.has("petition")).toBe(true);
  });

  it("extracts adjacent bigrams", () => {
    const tokens = tokenizeTitle(
      "Sensex plunges 800 points as tech shares drop",
    );
    expect(tokens.bigrams.has("sensex plunges")).toBe(true);
    expect(tokens.bigrams.has("plunges 800")).toBe(true);
    expect(tokens.bigrams.has("800 points")).toBe(true);
    expect(tokens.bigrams.has("points tech")).toBe(true);
    expect(tokens.bigrams.has("tech shares")).toBe(true);
    expect(tokens.bigrams.has("shares drop")).toBe(true);
  });

  it("standardizes numbers and abbreviations", () => {
    const tokens = tokenizeTitle(
      "Sensex falls 1,000 pts with 2.5% loss of Rs 500 cr",
    );
    expect(tokens.numbers.has("1000")).toBe(true);
    expect(tokens.numbers.has("2.5")).toBe(true);
    expect(tokens.numbers.has("500")).toBe(true);
    expect(tokens.unigrams.has("points")).toBe(true);
    expect(tokens.unigrams.has("percent")).toBe(true);
    expect(tokens.unigrams.has("crore")).toBe(true);
  });

  it("handles multi-comma Indian number formats and trailing dots on words", () => {
    const tokens = tokenizeTitle(
      "Cabinet clears Rs 1,50,00,000 project. Flights delayed.",
    );
    expect(tokens.numbers.has("15000000")).toBe(true);
    expect(tokens.unigrams.has("project")).toBe(true);
    expect(tokens.unigrams.has("flights")).toBe(true);
    expect(tokens.unigrams.has("delayed")).toBe(true);
    expect(tokens.unigrams.has("project.")).toBe(false);
  });
});
