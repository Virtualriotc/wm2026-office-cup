// Country -> flag mapping for team labels. We render SVG flag images (NOT emoji)
// because ~40% of players are on Windows, which renders flag emoji as country
// letters ("ES"). SVGs are self-hosted under /public/flags/<code>.svg.
//
// Keys are NORMALIZED names (lowercase, accents stripped, non-alphanumerics
// collapsed) so "Curaçao", "DR Congo", "USA" all resolve regardless of source.
// England/Scotland use their own flags (gb-eng/gb-sct), never the Union Jack.
// Aliases cover the alternate names a live results feed (ESPN/openfootball) may
// use for the same country in later rounds, so future fixtures resolve too.

/** Normalize a team name to a stable lookup key. */
export function normalizeTeam(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// normalized name -> ISO 3166-1 alpha-2 (or gb-eng/gb-sct) flag code.
const FLAG_CODES: Record<string, string> = {
  "algeria": "dz",
  "argentina": "ar",
  "australia": "au",
  "austria": "at",
  "belgium": "be",
  "bosnia herzegovina": "ba",
  "brazil": "br",
  "canada": "ca",
  "cape verde": "cv",
  "colombia": "co",
  "croatia": "hr",
  "curacao": "cw",
  "czech republic": "cz",
  "dr congo": "cd",
  "ecuador": "ec",
  "egypt": "eg",
  "england": "gb-eng",
  "france": "fr",
  "germany": "de",
  "ghana": "gh",
  "haiti": "ht",
  "iran": "ir",
  "iraq": "iq",
  "ivory coast": "ci",
  "japan": "jp",
  "jordan": "jo",
  "mexico": "mx",
  "morocco": "ma",
  "netherlands": "nl",
  "new zealand": "nz",
  "norway": "no",
  "panama": "pa",
  "paraguay": "py",
  "portugal": "pt",
  "qatar": "qa",
  "saudi arabia": "sa",
  "scotland": "gb-sct",
  "senegal": "sn",
  "south africa": "za",
  "south korea": "kr",
  "spain": "es",
  "sweden": "se",
  "switzerland": "ch",
  "tunisia": "tn",
  "turkey": "tr",
  "usa": "us",
  "uruguay": "uy",
  "uzbekistan": "uz",
  // --- aliases a live feed may use for the same nation (future rounds) ---
  "czechia": "cz",
  "turkiye": "tr",
  "korea republic": "kr",
  "republic of korea": "kr",
  "united states": "us",
  "united states of america": "us",
  "cote d ivoire": "ci",
  "ivorycoast": "ci",
  "bosnia and herzegovina": "ba",
  "dr of the congo": "cd",
  "democratic republic of the congo": "cd",
  "congo dr": "cd",
  "cabo verde": "cv",
  "south korea republic": "kr",
};

/**
 * Flag code for a team label, or null if it has no flag (a knockout placeholder
 * like "Group F Winner" / "Third Place …", or any unrecognized label). Callers
 * render a neutral badge when this is null.
 */
export function flagCode(team: string): string | null {
  return FLAG_CODES[normalizeTeam(team)] ?? null;
}

/** True when a label is a real country we have a flag for. */
export function hasFlag(team: string): boolean {
  return flagCode(team) !== null;
}
