import { describe, it, expect } from "vitest";
import { roundStyle, isThirdPlace, stageLabel } from "./predict-helpers";
import type { Match, Stage } from "@/lib/types";

// Minimal Match shape — roundStyle only reads id + stage.
const m = (stage: Stage, id = `x-${stage}`): Pick<Match, "id" | "stage"> => ({ id, stage });

describe("roundStyle", () => {
  it("returns null for group stage (keeps its existing royal tag, untouched)", () => {
    expect(roundStyle(m("group"))).toBeNull();
  });

  it("labels each knockout round by name", () => {
    expect(roundStyle(m("r32"))?.label).toBe("Round of 32");
    expect(roundStyle(m("r16"))?.label).toBe("Round of 16");
    expect(roundStyle(m("qf"))?.label).toBe("Quarter-final");
    expect(roundStyle(m("sf"))?.label).toBe("Semi-final");
    expect(roundStyle(m("final"))?.label).toBe("Final");
  });

  it("gives every knockout round a DISTINCT accent colour", () => {
    const bgs = (["r32", "r16", "qf", "sf", "final"] as Stage[]).map(
      (s) => roundStyle(m(s))!.bg,
    );
    expect(new Set(bgs).size).toBe(bgs.length);
  });

  it("flags ONLY the Final for the gold drop-shadow", () => {
    expect(roundStyle(m("final"))?.gold).toBe(true);
    for (const s of ["r32", "r16", "qf", "sf"] as Stage[]) {
      expect(roundStyle(m(s))?.gold).toBe(false);
    }
  });

  it("distinguishes the third-place play-off from a semi-final (both 'sf')", () => {
    const thirdPlace = m("sf", "of-match-for-third-place-l101-l102");
    const semi = m("sf", "of-semi-final-w97-w98");
    expect(isThirdPlace(thirdPlace)).toBe(true);
    expect(isThirdPlace(semi)).toBe(false);
    // The play-off is labelled "Third place", not the generic SF label.
    expect(roundStyle(thirdPlace)?.label).toBe("Third place");
    expect(roundStyle(semi)?.label).toBe(stageLabel("sf"));
    // …and carries its own (bronze) accent, distinct from the SF coral.
    expect(roundStyle(thirdPlace)!.bg).not.toBe(roundStyle(semi)!.bg);
  });

  it("never returns the gold flag for the third-place play-off", () => {
    expect(roundStyle(m("sf", "of-match-for-third-place-l101-l102"))?.gold).toBe(false);
  });
});
