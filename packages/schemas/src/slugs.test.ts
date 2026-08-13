import { describe, expect, it } from "vitest";
import {
  INTEREST_SLUGS,
  TOPIC_SLUGS,
  interestSlugSchema,
  topicSlugSchema,
} from "./slugs";

describe("topicSlugSchema", () => {
  it("accepts every declared topic", () => {
    for (const slug of TOPIC_SLUGS) {
      expect(topicSlugSchema.safeParse(slug).success).toBe(true);
    }
  });

  it("rejects an undeclared topic", () => {
    expect(topicSlugSchema.safeParse("crypto").success).toBe(false);
  });
});

describe("interestSlugSchema", () => {
  it("accepts every declared interest", () => {
    for (const slug of INTEREST_SLUGS) {
      expect(interestSlugSchema.safeParse(slug).success).toBe(true);
    }
  });

  it("keeps every interest a valid topic", () => {
    // The product promise is that choosing an interest surfaces more stories of
    // that topic. An interest with no matching topic would make that promise
    // unkeepable, and the interest pools unfillable.
    for (const interest of INTEREST_SLUGS) {
      expect(topicSlugSchema.safeParse(interest).success).toBe(true);
    }
  });

  it("excludes the topics a reader cannot opt into", () => {
    // PRD section 5.3: India is part of the shared core, not an optional topic.
    expect(interestSlugSchema.safeParse("india").success).toBe(false);
    expect(interestSlugSchema.safeParse("world").success).toBe(false);
  });
});
