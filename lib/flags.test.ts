import { describe, it, expect } from "vitest";
import { flagCode, normalizeTeam } from "./flags";

// The EXACT 48 real countries in the 2026 fixture data (enumerated from the
// live matches table). Every one must resolve to a flag.
const REAL_TEAMS = [
  "Algeria", "Argentina", "Australia", "Austria", "Belgium",
  "Bosnia & Herzegovina", "Brazil", "Canada", "Cape Verde", "Colombia",
  "Croatia", "Curaçao", "Czech Republic", "DR Congo", "Ecuador", "Egypt",
  "England", "France", "Germany", "Ghana", "Haiti", "Iran", "Iraq",
  "Ivory Coast", "Japan", "Jordan", "Mexico", "Morocco", "Netherlands",
  "New Zealand", "Norway", "Panama", "Paraguay", "Portugal", "Qatar",
  "Saudi Arabia", "Scotland", "Senegal", "South Africa", "South Korea",
  "Spain", "Sweden", "Switzerland", "Tunisia", "Turkey", "USA", "Uruguay",
  "Uzbekistan",
];

// Knockout placeholders + the two seeding oddities (L101/L102) — these must NOT
// get a flag; the UI shows a neutral badge instead.
const PLACEHOLDERS = [
  "Group F Winner", "Group A 2nd Place", "Round of 32 1 Winner",
  "Quarterfinal 2 Winner", "Semifinal 1 Winner",
  "Third Place Group A/B/C/D/F", "L101", "L102",
];

describe("flags", () => {
  it("covers all 48 real 2026 teams", () => {
    const missing = REAL_TEAMS.filter((t) => flagCode(t) === null);
    expect(missing, `unmapped teams: ${missing.join(", ")}`).toEqual([]);
    expect(REAL_TEAMS.length).toBe(48);
  });

  it("gives placeholders / unknowns NO flag (neutral badge)", () => {
    for (const p of PLACEHOLDERS) expect(flagCode(p), p).toBeNull();
  });

  it("England and Scotland use their own flags, not the Union Jack", () => {
    expect(flagCode("England")).toBe("gb-eng");
    expect(flagCode("Scotland")).toBe("gb-sct");
  });

  it("resolves alternate names a live feed may use in later rounds", () => {
    expect(flagCode("Czechia")).toBe("cz");
    expect(flagCode("Türkiye")).toBe("tr");
    expect(flagCode("Côte d'Ivoire")).toBe("ci");
    expect(flagCode("Congo DR")).toBe("cd");
    expect(flagCode("United States")).toBe("us");
    expect(flagCode("Korea Republic")).toBe("kr");
  });

  it("normalizes accents and punctuation", () => {
    expect(normalizeTeam("Curaçao")).toBe("curacao");
    expect(normalizeTeam("Bosnia & Herzegovina")).toBe("bosnia herzegovina");
  });
});
