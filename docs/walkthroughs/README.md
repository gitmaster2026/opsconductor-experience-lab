# Walkthrough specifications

Declarative, JSON-compatible step definitions for the verified NRS-01 and NRS-02
investigation paths, produced by the 2026-07-10 V1-LAUNCH-1 Founder Demo &
Launch Readiness Audit (`memory/V1_LAUNCH_1_AUDIT_2026-07-10.md` in the main
`OpsConductor` repo). No implementation code — each step names the highlighted
UI element, target object/lens, expected user action, expected application
state, and founder narration line.

These exist to de-risk a future **Guided Investigation** feature, which the
audit recommends for **V1.1, not V1**: the manual, search/click-driven
investigation already reads clearly for a first-time executive when a human
narrates it, and building the full guided-tour UI (Welcome, Scenario picker,
Skip/Don't-show-again, Resume, progress indicator) is net-new feature surface
that isn't required to launch.

- `NRS01_WALKTHROUGH.json` — Supplier Shortage → Manufacturing Recovery (10 steps)
- `NRS02_WALKTHROUGH.json` — Engineering Change → Customer/Operational Impact (8 steps)

Both were verified live against snapshot `contentHash:
e88a298c60b11b100ccb413e314d02c0bd3e175a44fd52bee035015386d47f41` on commit
`4f31aa2` — every object ID referenced was confirmed to exist and resolve to a
populated Passport at the time of writing. If the canonical snapshot changes,
re-verify object IDs before reusing these specs.
