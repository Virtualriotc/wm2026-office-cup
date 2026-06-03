# Build Fleet — how we'll build the WM 2026 Office Cup

> The agent roster, tools, and loop for building the app **after the wireframe is approved**. Everything below is grounded in an inventory of what's actually installed on this machine + verified marketplaces (June 2026). Items marked **author** don't exist yet and we create them; everything else is installed or one `/plugin install` away.

## TL;DR roster

| Role | Who does it | Status |
|------|-------------|--------|
| **Orchestration** | `superpowers` skill chain: brainstorming → writing-plans → subagent-driven-development, in a git worktree | installed |
| **Design lead** | `frontend-design` skill + `motion-framer` / `gsap-scrolltrigger` skills (from `claudedesignskills`) | frontend-design installed; motion skills = install |
| **Frontend builder** | the per-task implementer of `subagent-driven-development` (Motion / canvas-confetti / Rive) | installed |
| **Technical QA** | `test-driven-development` + `verification-before-completion` + `/code-review` + `pr-review-toolkit` (silent-failure-hunter on the lock path) | install code-review + pr-review-toolkit |
| **Visual / design QA** | Playwright MCP (real screenshots at breakpoints + animation frames) + `web-design-guidelines` (Vercel) | Playwright = install; guidelines installed |
| **Design critic (in the loop)** | **author** `.claude/agents/design-critic.md` — the missing piece | author |

The "intelligence" lives in the installed skills; the custom agents are thin `model + tools + skills` wrappers.

## Install before building

```
/plugin marketplace add freshtechbro/claudedesignskills
/plugin install motion-framer            # state-based React motion (verified real, repo 196★)
/plugin install gsap-scrolltrigger       # one marquee scroll sequence, only if needed
/plugin install playwright@claude-plugins-official   # the visual-QA agent's eyes (Microsoft @playwright/mcp)
/plugin install code-review@claude-plugins-official  # 5-reviewer PR pass + confidence filter
/plugin install pr-review-toolkit@claude-plugins-official  # silent-failure-hunter, pr-test-analyzer
```

Optional / on demand: `rive-interactive` and `lottie-animations` (designer-authored motion), `react-three-fiber`+`threejs-webgl` (only if a real 3D moment earns three.js's ~155KB), `locomotive-scroll`+`barba-js` (smooth-scroll/page-transition polish).

**Do NOT rely on** the empty stub dirs in `~/.claude/skills/` (`design-review`, `qa`, `design-consultation`, …) — they are 64-byte placeholders with no `SKILL.md` and load nothing. **Skip** `claude-design-mcp` (not published to PyPI, 1★) and **Agent Teams / TeamCreate** (experimental, gated behind an env flag, nondeterministic — overkill for a single frontend).

## The five custom agents to author

Thin `.claude/agents/*.md` files in the project. Route cost via `model`: Opus for design/critic/visual judgment, Sonnet for mechanical build.

1. **`motion-design-lead`** (opus) — wraps `frontend-design` + `motion-framer`. Owns aesthetic direction + motion language. Output: a design spec + one reference component, **not** the whole app.
2. **`frontend-builder`** (sonnet; opus for hard animation) — the per-task implementer the build loop dispatches. Writes component + animation code, runs the dev server.
3. **`tech-qa-reviewer`** (sonnet/opus) — TDD-first; runs tests/typecheck/lint/build with **real observed output** (no "should pass"). Writes the load-bearing test: *the server rejects a prediction write after kickoff even when the UI is bypassed* (lock enforcement is server-side, tested by hitting the endpoint directly, not by checking a greyed-out button).
4. **`visual-qa-reviewer`** (opus) — the only agent with eyes. Drives Playwright MCP to screenshot at 390/768/1280px + capture the Department Race animation at timed offsets, judges against the design spec, runs `web-design-guidelines` for a11y + `prefers-reduced-motion`.
5. **`design-critic`** (opus) — final in-loop judge. Gets **only the work product** (per `requesting-code-review`), scores design-vs-spec + tech-QA + visual-QA, returns **APPROVE / ITERATE** with specific blocking feedback. ITERATE feeds back into the build loop. This is the "critic that sits there" — it does not exist locally, so we build it; its rubric = the `frontend-design` aesthetic criteria + the Vercel motion rules (honor reduced-motion, transform/opacity only, no `transition: all`, interruptible animations).

## The loop

```
Phase 0  brainstorming         → pin scope + explicit visual & functional acceptance criteria
Phase 1  using-git-worktrees   → isolate the build
Phase 2  motion-design-lead    → design spec + reference component
Phase 3  writing-plans         → task-decomposed plan
Phase 4  subagent-driven-development:
           frontend-builder implements a task
           → tech-qa-reviewer (spec, then code-quality, re-review until clean)
Phase 5  visual-qa-reviewer    → screenshots + animation frames + a11y (per milestone)
Phase 6  design-critic         → APPROVE or ITERATE-with-feedback → loops back to Phase 4
Phase 7  finishing-a-development-branch → land. Never auto-push.
```

Two non-negotiables carried from the research: **server-side lock enforcement is tested by bypassing the UI**, and **every motion moment has a reduced-motion fallback** (the design critic blocks merge without one).
