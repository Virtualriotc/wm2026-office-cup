// ============================================================================
// COPY — every user-facing string in one typed place.
//
// Seeded from docs/copy-deck.md, voiced for the brighter, friendly
// neo-brutalist tone (witty colleague who runs the pool; warm, confident, a
// little cheeky — never corporate, never childish). The copy agent will
// REFINE the values; the KEY SHAPE below is the stable contract — keep keys.
//
// i18n: `en` is the only locale now. The structure is locale-keyed so a `de`
// locale can be dropped in later without touching call sites: read via
// `copy()` (defaults to `en`).
//
// ----------------------------------------------------------------------------
// VOICE NOTE — read before changing any string.
//
// Who's talking: the witty colleague who runs the office pool. Warm, confident,
// a little cheeky. Never corporate, never childish, never trying too hard.
//
// Four standards, every string: PURPOSEFUL, CONCISE, CONVERSATIONAL, CLEAR.
//   • Sentence case everywhere (not Title Case).
//   • Buttons: a verb leads, 2–4 words ("Pick my matches", not "Submit").
//   • Front-load the point. Say the concrete thing first ("Picks close in 3h").
//   • Never blame the user — not in errors, not in results ("Not your day",
//     never "you were wrong").
//   • "You", never "users". One exclamation mark per screen, max.
//   • Say it out loud — if you wouldn't say it to a colleague, rewrite it.
//
// Compliance strings (disclaimers.*) keep their legal substance verbatim in
// meaning — voiced, not gutted. Still need a German translation + lawyer check
// before launch. Don't trim the protective clauses to sound snappier.
// ----------------------------------------------------------------------------
// ============================================================================

export type Locale = "en";

export interface CopyShape {
  /** Cross-app chrome: nav, the unofficial/no-betting tag, brand. */
  app: {
    brand: string;
    tagline: string;
    unofficialTag: string;
    nav: {
      predict: string;
      scoreboard: string;
      organizer: string;
      account: string;
    };
    heartbeatUpdatedNow: string;
    heartbeatUpdatedAgo: string; // "{time} ago"
  };

  /** Landing / hero. */
  hero: {
    eyebrow: string;
    titleLine1: string;
    titleLine2: string;
    /** The bold "what is this + how" line above the CTA. */
    about: string;
    primaryCta: string;
    ctaHelper: string;
    haveCodeCta: string;
    disclaimer: string;
    scrollCue: string;
    steps: {
      createAccount: string;
      saveCode: string;
      pickMatches: string;
      watchScores: string;
    };
  };

  /** Join / create account. */
  join: {
    eyebrow: string;
    title: string;
    subhead: string;
    nameLabel: string;
    namePlaceholder: string;
    nameHelper: string;
    departmentLabel: string;
    departmentHelper: string;
    /** The combobox sentinel option that switches to a free-text field. */
    departmentAddOption: string;
    /** Label for the "type a brand-new department" text field. */
    newDepartmentLabel: string;
    newDepartmentPlaceholder: string;
    newDepartmentHelper: string;
    /** Inline action to drop the typed field and go back to the picker. */
    departmentBackToList: string;
    consentCheckbox: string;
    prizeLine: string;
    primaryCta: string;
    privacyFooter: string;
  };

  /** Signed-in account controls: sign out + self-service data removal. */
  account: {
    /** Heading for the signed-in management card. */
    manageTitle: string;
    signedInAs: string; // "Signed in as {name}"
    signOutCta: string;
    /** Data-removal (GDPR erasure) control + confirm flow. */
    removeTitle: string;
    removeBody: string;
    removeCta: string;
    removeConfirmPrompt: string;
    removeConfirmCta: string;
    removeCancelCta: string;
    removeWorking: string;
    removeDone: string;
    removeDoneTitle: string;
    removeDoneCta: string;
  };

  /** The code shown once after joining, and the paste-to-continue flow. */
  code: {
    eyebrow: string;
    getMyCodeCta: string;
    savedTitle: string;
    savedSubhead: string;
    copyCta: string;
    copied: string;
    continueCta: string;
    pasteTitle: string;
    pasteSubhead: string;
    pasteLabel: string;
    pastePlaceholder: string;
    pasteCta: string;
  };

  /** Pick / predict surface. */
  predict: {
    title: string;
    matchdayHeader: string; // "Matchday {n} · {count} games"
    instruction: string;
    lockOpen: string; // "Locks in {time}"
    lockClosed: string;
    tapAWinner: string;
    drawLabel: string;
    resultCorrect: string; // "Nailed it · +{points}"
    resultWrong: string;
    resultMissed: string;
    saveCta: string;
    saveSuccess: string;
    saveError: string;
    postLockNote: string;
    signInToPick: string;
    consensusLabel: string; // "Office picked"
    empty: string;
  };

  /** Pre-tournament countdown hero (shown on the scoreboard before kickoff). */
  countdown: {
    eyebrow: string;
    heading: string; // "The cup kicks off in"
    firstFixtureLabel: string; // "First up"
    firstFixtureLine: string; // "{home} vs {away} · {date}"
    picksCta: string; // primary CTA -> /predict
    picksOpenSubline: string; // "predictions are open" reassurance
    lineupLabel: string; // "At the start line"
  };

  /** The department race (home / hero of the scoreboard). */
  race: {
    header: string;
    sectionEyebrow: string;
    roundNote: string; // "Matchday {n} is in"
    biggestMover: string; // "{dept} jumped {n} — mover of the week"
    topTipsterTitle: string;
    yourRankLabel: string;
    yourRankValue: string; // "#{rank} · up {delta}"
    yourRankNote: string; // "Top {pct}% — keep climbing" (top half only)
    yourRankNoteClimb: string; // shown lower down, no misleading percentage
    shareCta: string;
    fairnessNote: string;
  };

  /** Relative leaderboard. */
  leaderboard: {
    tabYou: string;
    tabDepartments: string;
    withinReach: string;
    topOfCup: string;
    behindNote: string; // "{points} points behind {name}. Catchable."
    departmentsFooter: string;
    empty: string;
  };

  /** Share card. */
  share: {
    cardHeadline: string;
    cardSub: string;
    primaryCta: string;
    secondaryCta: string;
  };

  /** Organizer surface (auto results + manual overrides). */
  organizer: {
    title: string;
    /** Shown to the UNLOCKED organizer — the real "how this works" line. */
    subhead: string;
    /** Shown on the locked GATE — a playful "nothing here for you" for the
     *  curious colleague who wanders in. NOT the admin instruction. */
    gateSubhead: string;
    codeGateLabel: string;
    codeGatePlaceholder: string;
    codeGateCta: string;
    /** "Last synced {time} · {count} from the feed" heartbeat line. */
    lastSyncedLabel: string; // "Last synced {time}"
    feedCountLabel: string; // "{count} from the feed"
    neverSynced: string;
    syncNowCta: string;
    syncingLabel: string;
    /** The auto-result line per match. "Auto result: {outcome}". */
    autoResult: string; // "Auto result: {outcome}"
    /** Shown when a match has no recorded result yet. */
    noResultYet: string;
    /** Shown when the organizer's override is the live value. */
    overrideActive: string; // "Your override: {outcome}"
    /** The override action label per match. */
    overrideLabel: string;
    overrideCta: string;
    overrideSavedToast: string; // "Override saved. Tables updating."
    recomputeNote: string;
  };

  /** Notifications (two by design). */
  notifications: {
    preLockTitle: string;
    preLockBody: string; // "You haven't called Matchday {n} yet. Two taps and you're set."
    recapTitle: string; // "Matchday {n} is scored"
    recapBody: string; // "You went {hits} of {total} and climbed to #{rank}. See the new table."
  };

  /** Disclaimers / compliance (legal substance preserved; needs DE + lawyer). */
  disclaimers: {
    banner: string;
    consent: string;
    prize: string;
    privacyFooter: string;
    footer: string;
  };

  /** Errors. Never blame the user. */
  errors: {
    generic: string;
    nameTaken: string;
    departmentInvalid: string;
    invalidCode: string;
    pickAfterLock: string;
    notOrganizer: string;
    tooManyAttempts: string;
  };

  /** Empty states. */
  empty: {
    noMatchesOpen: string;
    noResultsYet: string;
    noLeaderboardYet: string;
  };
}

const en: CopyShape = {
  app: {
    brand: "WM 2026 Office Cup",
    tagline: "Call the winners. Carry your team up the table.",
    unofficialTag: "UNOFFICIAL OFFICE GAME · NO BETTING",
    nav: {
      predict: "Predict",
      scoreboard: "Scoreboard",
      organizer: "Organizer",
      account: "Account",
    },
    heartbeatUpdatedNow: "Updated just now",
    heartbeatUpdatedAgo: "Updated {time} ago",
  },

  hero: {
    eyebrow: "11 Jun – 19 Jul · 48 teams · 104 games",
    titleLine1: "WM 2026",
    titleLine2: "OFFICE CUP",
    about:
      "Pick a username and your department (add a new one if you like), save your login code, then predict who wins each match — and help answer the big question: which department has the best ball knowledge?",
    primaryCta: "Create your account",
    ctaHelper: "60 seconds. No password, no email.",
    haveCodeCta: "Got a code? Paste to continue",
    disclaimer:
      "A private game by colleagues, for colleagues. Not an Enpal project, just for the bragging rights.",
    scrollCue: "See the race",
    steps: {
      createAccount: "Create your account",
      saveCode: "Save your code",
      pickMatches: "Pick your matches",
      watchScores: "Watch the scores roll in",
    },
  },

  join: {
    eyebrow: "New here?",
    title: "Grab your spot",
    subhead: "No password, no email. Just a name and your team.",
    nameLabel: "What should we call you?",
    namePlaceholder: "e.g. Max Stegemann",
    nameHelper: "A nickname's perfect. Keep it work-friendly.",
    departmentLabel: "Your department",
    departmentHelper: "This is your team in the race. Not listed? Add it below.",
    departmentAddOption: "+ Add a new department",
    newDepartmentLabel: "Name your department",
    newDepartmentPlaceholder: "e.g. Energy Growth",
    newDepartmentHelper: "Start a new lane. Your teammates can join it after you.",
    departmentBackToList: "Pick from the list instead",
    consentCheckbox:
      "I'm in for the fun of it. I get that this is a private game, not run by or the responsibility of Enpal. I'm 18 or over, happy to show my name and department on the board, and I get that my data is hosted on Vercel & Neon (US). I can remove it myself anytime from Account, or ask the organiser.",
    prizeLine:
      "No entry fee, no stakes, just bragging rights. The sharpest tipsters get a small thank-you gift at the end.",
    primaryCta: "Pick my matches",
    privacyFooter:
      "We keep your nickname, department, picks, and a private code. Nothing else: no email, no tracking. Hosted on Vercel & Neon (US) under standard data-transfer safeguards. Remove your data yourself anytime from Account, or ask the organiser — and everything goes after the final.",
  },

  account: {
    manageTitle: "Your account",
    signedInAs: "Signed in as {name}",
    signOutCta: "Sign out",
    removeTitle: "Remove my data",
    removeBody:
      "Delete your account, picks, and code for good. You'll vanish from the board. This can't be undone.",
    removeCta: "Delete my data",
    removeConfirmPrompt: "Sure? This wipes everything and can't be undone.",
    removeConfirmCta: "Yes, delete it all",
    removeCancelCta: "Keep me in",
    removeWorking: "Removing…",
    removeDone: "All gone. Thanks for playing — you're welcome back anytime.",
    removeDoneTitle: "You're deleted ✅",
    removeDoneCta: "Back to the cup",
  },

  code: {
    eyebrow: "Have a code?",
    getMyCodeCta: "Get my code",
    savedTitle: "Save this code now",
    savedSubhead:
      "It's your ONLY way back in — no email, no password, no reset, no recovery. Screenshot it or drop it in your notes before you carry on. Lose it and you'd start over.",
    copyCta: "Copy my code",
    copied: "Copied",
    continueCta: "Got it, let's pick",
    pasteTitle: "Welcome back",
    pasteSubhead: "Paste the code you saved and pick up where you left off.",
    pasteLabel: "Your code",
    pastePlaceholder: "MP-XXXX-XXXX-XXXX",
    pasteCta: "Continue",
  },

  predict: {
    title: "Your picks",
    matchdayHeader: "Matchday {n} · {count} games",
    instruction: "Tap who wins. Draws count too.",
    lockOpen: "Locks in {time}",
    lockClosed: "Locked at kickoff",
    tapAWinner: "Tap a winner",
    drawLabel: "Draw",
    resultCorrect: "Nailed it · +{points}",
    resultWrong: "Not your day",
    resultMissed: "Missed this one",
    saveCta: "Save my picks",
    saveSuccess: "Picks locked in. Good luck out there.",
    saveError:
      "Couldn't save your picks. Check your connection, then tap save again.",
    postLockNote: "Picks lock at kickoff and go public. No edits after that.",
    signInToPick: "Join with a code above to lock in your pick →",
    consensusLabel: "Office picked",
    empty: "All caught up. Your next picks open after tonight's games.",
  },

  countdown: {
    eyebrow: "Kickoff is coming",
    heading: "The cup kicks off in",
    firstFixtureLabel: "First up",
    firstFixtureLine: "{home} vs {away} · {date}",
    picksCta: "Get your group-stage picks in",
    picksOpenSubline: "Predictions are open now — lock in your group stage before the first whistle.",
    lineupLabel: "At the start line",
  },

  race: {
    header: "The race",
    sectionEyebrow: "Department standings",
    roundNote: "Matchday {n} is in",
    biggestMover: "{dept} jumped {n} spots — mover of the week",
    topTipsterTitle: "This week's sharpest",
    yourRankLabel: "Your rank",
    yourRankValue: "#{rank} · up {delta}",
    yourRankNote: "Top {pct}% and climbing",
    yourRankNoteClimb: "The table's wide open — every pick climbs",
    shareCta: "Share the table",
    fairnessNote:
      "Score is average points per active player, so small teams compete fairly.",
  },

  leaderboard: {
    tabYou: "You",
    tabDepartments: "Departments",
    withinReach: "Within reach",
    topOfCup: "Top of the cup",
    behindNote: "{points} points behind {name}. Catchable.",
    departmentsFooter:
      "Score is average points per active player, so small teams compete fairly.",
    empty: "No games scored yet. The table wakes up after the first whistle.",
  },

  share: {
    cardHeadline: "{dept} leads the office",
    cardSub: "{challenger} is charging. Who's catching them?",
    primaryCta: "Send to your team channel",
    secondaryCta: "Copy image",
  },

  organizer: {
    title: "Results & overrides",
    subhead:
      "Results land automatically from the feed. You only step in to fix one the feed got wrong or hasn't called.",
    gateSubhead:
      "Nothing to see here, honestly — look away. This is the boring back room where whoever runs the cup nudges a stray result. Not you? Shoo. Your picks miss you out front.",
    codeGateLabel: "Organizer code",
    codeGatePlaceholder: "MP-XXXX-XXXX-XXXX",
    codeGateCta: "Unlock",
    lastSyncedLabel: "Last synced {time}",
    feedCountLabel: "{count} from the feed",
    neverSynced: "No sync yet this session",
    syncNowCta: "Sync now",
    syncingLabel: "Syncing…",
    autoResult: "Auto result: {outcome}",
    noResultYet: "No result yet — the feed will fill this in.",
    overrideActive: "Your override: {outcome}",
    overrideLabel: "Override the call",
    overrideCta: "Override",
    overrideSavedToast: "Override saved. Tables updating now.",
    recomputeNote:
      "Overrides win over the feed and recompute every leaderboard. Safe to redo anytime.",
  },

  notifications: {
    preLockTitle: "Picks close in 3 hours",
    preLockBody: "You haven't called Matchday {n} yet. Two taps and you're set.",
    recapTitle: "Matchday {n} is scored",
    recapBody: "You went {hits} of {total} and you're now #{rank}. See the new table.",
  },

  disclaimers: {
    banner:
      "A friendly World Cup prediction game by colleagues, for colleagues. A private, personal project, not organised or endorsed by Enpal. Just for fun, and joining is completely voluntary.",
    consent:
      "I'm joining for fun and on my own. I get that this is a private project, not an Enpal thing, and that Enpal isn't involved or responsible. I'm 18 or older. I'm happy with my chosen name and department on the leaderboard. I understand my data is hosted on Vercel & Neon (US) under standard data-transfer safeguards, and I can remove it myself anytime from the Account screen or ask the organiser to remove it.",
    prize:
      "No entry fee, no stakes, pure football bragging rights. At the end, the organiser will arrange a small thank-you gift for the top predictors. A token of fun, nothing more.",
    privacyFooter:
      "We store only the name and department you pick (a nickname is fine), your predictions, and a private code. No email, no password, no tracking. Hosted on Vercel & Neon (US) under standard data-transfer safeguards. You can remove your data yourself anytime from the Account screen, or ask the organiser to remove it for you — and everything is deleted shortly after the final.",
    footer:
      "WM 2026 Office Cup · a private, just-for-fun game · not affiliated with or endorsed by Enpal · no entry fee, no stakes · hosted on Vercel & Neon (US) · remove your data anytime from Account.",
  },

  errors: {
    generic: "That didn't go through. Give it another tap in a moment.",
    nameTaken:
      "Someone with that name is already in this department. Add your surname or an initial to stand out.",
    departmentInvalid: "Give your department a short name (up to 40 characters).",
    invalidCode: "That code doesn't look right. Check it and try again.",
    pickAfterLock:
      "This match is locked. Kickoff's been and gone, so your earlier pick stands.",
    notOrganizer: "That code doesn't open the organizer screen. Need one? Ask the organiser.",
    tooManyAttempts: "Too many tries just now. Take a breath and try again in a minute.",
  },

  empty: {
    noMatchesOpen: "All caught up. Your next picks open after tonight's games.",
    noResultsYet: "No results in yet. Tables wake up after the first whistle.",
    noLeaderboardYet:
      "No games scored yet. The table wakes up after the first whistle.",
  },
};

const LOCALES: Record<Locale, CopyShape> = { en };

/** The default (English) copy. Import this directly in components for now. */
export const COPY: CopyShape = en;

/** Locale-aware accessor for when `de` lands. Falls back to `en`. */
export function copy(locale: Locale = "en"): CopyShape {
  return LOCALES[locale] ?? en;
}

/**
 * Tiny token interpolation: fill `{name}` placeholders from a map.
 * e.g. fill(COPY.predict.matchdayHeader, { n: 4, count: 4 }).
 */
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in values ? String(values[key]) : `{${key}}`,
  );
}

/**
 * Landing FAQ — the rules in one place, in plain language. Standalone (not on
 * CopyShape) so it stays a simple editable list. Rendered by Faq, under the
 * always-visible scoring table.
 */
export const PREDICT_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "How do I make a pick?",
    a: "Tap the team you think will win. In the group stage you can also pick a draw. Change your pick as often as you like, up until kickoff.",
  },
  {
    q: "When do picks lock?",
    a: "At kickoff. Once a match starts, your pick is locked and becomes visible to everyone. You can't change it after that.",
  },
  {
    q: "Do wrong picks cost me points?",
    a: "No. A correct pick scores the round's points, and a wrong one scores zero. There's no penalty, so it's always worth picking every match.",
  },
  {
    q: "How does my department win?",
    a: "We average each department's points across its active players, so a smaller team can still beat a bigger one. Knockout rounds are worth more, so the table keeps moving right up to the final.",
  },
  {
    q: "What is the jersey pool?",
    a: "An optional side prize. Everyone who joins chips in, and the pot pays for one jersey of the winner's choice. You join from your Account screen any time, and you can play the whole tournament without it.",
  },
  {
    q: "Who wins the jersey?",
    a: "The highest-ranked player who joined the pool. If the overall number one didn't join, it goes to the top-ranked person who did.",
  },
  {
    q: "I lost my code. Can I get it back?",
    a: "No. Your code is the only way into your account, and there's no email or password to recover it. Save it somewhere you'll find again, like a screenshot or your notes.",
  },
];

/**
 * Jersey prize pool — voluntary opt-in. Standalone copy (not on CopyShape).
 * Rendered by JerseyPool on the Account page + nudged after signup.
 */
export const JERSEY = {
  title: "Jersey pool",
  badge: "Optional",
  blurb:
    "An optional side prize. Everyone who joins splits the cost evenly, and the pot pays for one jersey of the winner's choice. The highest-ranked player who joined takes it home. You can play the whole tournament without joining.",
  agree:
    "Joining adds you to the pool and the shared cost, and confirms you accept these terms.",
  optInCta: "Join the pool",
  optOutCta: "Leave the pool",
  working: "Saving…",
  inTitle: "You're in the pool",
  inBody:
    "Finish top of the players who joined and the jersey's yours. You can leave any time before the final.",
  outTitle: "Fancy the jersey?",
};

/**
 * Jersey intro — the fuller pitch shown once, in a popup, right after a new
 * player saves their code (before they reach the predictions). This is the
 * "more info" version of the Account toggle, adapted from the organiser's note.
 * Rendered by JerseyIntroModal.
 */
export const JERSEY_INTRO = {
  eyebrow: "One optional extra",
  title: "The jersey pool",
  lead:
    "Alongside the game there's a voluntary jersey prize pool. Joining is entirely up to you.",
  points: [
    { h: "The prize", b: "One jersey of the winner's choice." },
    {
      h: "Who pays",
      b: "Everyone who joins splits the cost evenly. Nobody else pays a thing.",
    },
    {
      h: "Who wins it",
      b: "The highest-ranked player who joined. If the number one didn't join, it goes to the top-ranked person who did.",
    },
    {
      h: "Still optional",
      b: "You can play the whole tournament, full ranking and all, without joining.",
    },
  ],
  agree: "Joining adds you to the pool and the shared cost, and means you accept these terms.",
  joinCta: "Join the pool",
  skipCta: "Maybe later",
  footnote: "You can change this any time from your Account screen.",
};
