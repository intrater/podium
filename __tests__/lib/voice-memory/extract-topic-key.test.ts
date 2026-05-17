import { describe, expect, it } from "vitest";

import {
  extractTopicKey,
  slugify,
} from "@/lib/voice-memory/extract-topic-key";

describe("slugify", () => {
  it("lowercases and converts spaces to hyphens", () => {
    expect(slugify("Brock Purdy")).toBe("brock-purdy");
    expect(slugify("WR room")).toBe("wr-room");
    expect(slugify("Trent Williams")).toBe("trent-williams");
  });

  it("strips punctuation", () => {
    expect(slugify("$50M contract!")).toBe("50m-contract");
    expect(slugify("McCaffrey's health")).toBe("mccaffrey-s-health");
  });

  it("collapses multiple separators", () => {
    expect(slugify("  Trent   Williams  ")).toBe("trent-williams");
    expect(slugify("foo--bar___baz")).toBe("foo-bar-baz");
  });

  it("returns empty string for inputs with no alphanumerics", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("   ")).toBe("");
  });

  it("is deterministic across repeated calls", () => {
    const input = "Kyle Shanahan's playoff record";
    expect(slugify(input)).toBe(slugify(input));
    expect(slugify(input)).toBe(slugify(input));
  });
});

describe("extractTopicKey", () => {
  it("uses the top surfacing entity", () => {
    expect(extractTopicKey(["Brock Purdy", "contract", "money"])).toBe("brock-purdy");
    expect(extractTopicKey(["Mexico City"])).toBe("mexico-city");
  });

  it("returns 'general' when surfacing_entities is empty", () => {
    expect(extractTopicKey([])).toBe("general");
  });

  it("returns 'general' when the top entity slugs to empty", () => {
    expect(extractTopicKey(["!!!"])).toBe("general");
    expect(extractTopicKey(["   "])).toBe("general");
  });

  it("ignores entities after the first", () => {
    // Determinism guarantee: only the head matters, so reordering
    // downstream entities doesn't shift the key.
    expect(extractTopicKey(["Purdy", "Aiyuk", "Deebo"])).toBe(
      extractTopicKey(["Purdy", "Deebo", "Aiyuk"]),
    );
  });

  it("is deterministic for the same input", () => {
    const entities = ["Purdy contract", "money", "QB market"];
    expect(extractTopicKey(entities)).toBe(extractTopicKey(entities));
  });
});
