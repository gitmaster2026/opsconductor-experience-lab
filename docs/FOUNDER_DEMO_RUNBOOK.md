# Founder Demo — Operator Runbook

V1-DEMO-1. This is the operator's reference for running either
`docs/FOUNDER_DEMO_LONG.md` or `docs/FOUNDER_DEMO_SHORT.md` reliably.
Read it once before the first rehearsal; skim the checklists before every
live run.

## Pre-demo preparation

- **Browser:** Chromium or Chrome, current stable channel. Other engines
  are not part of this sprint's rehearsal coverage (see
  `docs/DEMO_STATE_AUDIT.md`'s Phase 9 results).
- **Viewport/resolution:** 1440×900 or larger for screen sharing. 1280px
  width is the smallest rehearsed and confirmed working; below that, the
  Universe canvas and toolbar begin to clip (see the Failure-Recovery
  Matrix, "browser width causes clipping").
- **Zoom level:** browser zoom at 100%. The app's own "Depth" slider is a
  separate, in-app zoom concept - do not confuse the two.
- **Clean browser profile:** use a profile with no other extensions
  injecting overlays/banners, and no other tabs playing audio/video that
  could interrupt screen share. A private/incognito window is the
  simplest way to guarantee a clean profile.
- **Demo Reset procedure:** open **Guided Investigations** in the toolbar
  → click **Reset Demo** (transient) for a same-session reset between
  rehearsals, or **Full Demo Reset** (confirms, then also clears guided
  progress and the first-use invitation) before the very first rehearsal
  of the day. See `docs/DEMO_STATE_AUDIT.md` for the exact contract.
- **Build/version confirmation:** run `npm run build` and confirm
  **1066/1066 tests** pass (this sprint's count - see
  `CURRENT_STATE.md` for the authoritative number as of the latest
  sprint) before rehearsing. Confirm the served app is the branch you
  intend to demo (`git status`/`git log -1`).
- **Fallback browser tab:** open a second tab to the same `npm run serve`
  URL, already past the initial data load, kept in the background. If the
  primary tab hard-fails mid-demo, switch tabs rather than reloading live.
- **Pre-demo smoke test** (run once, same session as the final
  rehearsal):
  - [ ] NRS-01 runs start-to-completion without a missing-object fallback.
  - [ ] NRS-02 runs start-to-completion without a missing-object fallback.
  - [ ] Universe Search for `CUST-HORIZON` returns the governed commitment
        as its top identity match.
  - [ ] Hover Preview appears on a real Universe node hover and disappears
        on mouseout.
  - [ ] Visual Layers bar opens, a built-in preset applies, "Reset to Full
        Enterprise" restores the baseline.

## Opening checklist

Confirm every item below immediately before the audience sees the screen
(after a Demo Reset):

- [ ] Lens reads **Universe** (toolbar's Universe button is highlighted).
- [ ] Visual Layers bar reads **Full Enterprise**.
- [ ] No selected object (no Passport content, no persistent Universe
      card visible on canvas).
- [ ] No visible coachmark/spotlight/highlight anywhere on screen.
- [ ] No open modal (Scope Explorer, Visual Layers panel, Saved Views,
      Scenario Picker, Functional Radar workspace, guided coachmark
      overlay all fully closed).
- [ ] Time slider at the baseline (rightmost/current) position, matching
      the label used in the long/short scripts.
- [ ] First-use invitation banner state matches what you intend: hidden if
      you already dismissed it this rehearsal session (transient reset
      preserves the dismissal), visible if you ran a Full Demo Reset and
      want to show it once, on purpose.

## During-demo operating rules

- **Where to pause:** after every Passport switch inside a guided
  investigation (each `waitForSelection` step), pause 1-2 seconds before
  narrating - the coachmark text itself is a legitimate reading beat for
  the audience, not dead air to fill with clicking ahead.
- **Which clicks require precision:** Risk Board cards (small target at
  the Enterprise 5-card layout - click the card body, not its edge);
  the Visual Layers bar's preset label specifically (not the bar's
  padding); a guided investigation's spotlighted node in a dense Universe
  cluster.
- **When to use Search instead of clicking the graph:** any time a
  `waitForSelection` target is small, occluded, or the camera hasn't
  finished settling. Universe Search satisfies the exact same
  `waitForSelection` condition as a direct canvas click - there is no
  difference in outcome, only in reliability.
- **When not to move the camera manually:** never drag/zoom the Universe
  canvas manually while a guided investigation is running. The framework
  drives `cameraFocus`/spotlight beats itself; a manual camera move can
  leave the spotlighted node out of frame with no way back except
  Universe Search.
- **Which steps can be skipped:** see each script's own "Skip rule"
  column. In general: intro/transition/preset-acknowledgment beats are
  skippable narration-only; any `waitForSelection` step inside a running
  guided investigation is **not** individually skippable - the walkthrough
  requires the real click to advance (see the Recovery Matrix entry
  "guided scenario does not advance").
- **How to recover without announcing a failure:** narrate the NEXT
  correct fact while performing the recovery action - e.g. "and while
  that loads, let's confirm this is the same commitment we opened a
  moment ago" while re-selecting via Search. Never say "that's broken" or
  "let me try that again" on camera; the Recovery Matrix below gives a
  spoken bridge sentence for every listed failure mode instead.

## Post-demo reset

- [ ] Run **Reset Demo** (transient) immediately after the audience
      leaves, restoring the baseline for the next rehearsal or the next
      presenter.
- [ ] If this was the LAST demo of the day, or you exercised anything
      that shouldn't linger into tomorrow's first-use experience, run
      **Full Demo Reset** instead.
- [ ] Verify no local state changed unexpectedly: reload the tab once
      (a real page reload is safe - Demo Reset's effect is not itself
      persisted across reloads by design, only the preferences
      `docs/DEMO_STATE_AUDIT.md` documents as preserved actually survive a
      reload) and confirm the app boots to its ordinary default (Universe,
      whatever Visual Layers default you had saved, no guided scenario
      auto-running).

---

## Failure-Recovery Matrix

| Symptom | Likely cause | Fastest silent recovery | Spoken bridge (if recovery is visible) | Fallback beat | Abandon or continue? |
|---|---|---|---|---|---|
| Expected graph node is difficult to click | Node is small/occluded in a dense cluster | Open Universe Search, type the object's id fragment or name, select the result | "Let's pull that up directly." | Any beat whose action says "select the spotlighted/linked object" | Continue |
| Camera is positioned incorrectly | A manual pan/zoom happened, or a prior focus didn't fully settle | Re-select the current object via Universe Search - this re-issues the camera focus | "One more click to re-center." | Same beat, retried | Continue |
| Wrong object selected | Missed the correct Passport relationship row / clicked an adjacent node | Re-open the correct object via Search or the current Passport's Relationships list | "Let's open the right one." | Same beat | Continue |
| Search query returns multiple similar records | Query too short/generic (e.g. "Horizon" matches both `RB-CPP-HORIZON` and the nr04 commitment), or two objects' labels both contain the same fragment (confirmed in rehearsal: searching the bare fragment `SHP-NR-GOU-6101` for beat L14/S7 resolves to `nr04:exec:SHIPREL-NR-GOU-6101` - "Shipment Released..." - ahead of the intended `nr04:shipment:SHP-NR-GOU-6101` - "Shipment SHP-NR-GOU-6101..." - because results tie-break alphabetically by label and "Released" sorts before the shipment's own label) | Use the longer, more specific fragment named in the script (`CUST-HORIZON`; `shipment:SHP-NR-GOU-6101` for beat L14/S7 specifically) | (usually invisible - just pick the right row) | Beat L5/S1 (or L14/S7 for the shipment) | Continue |
| Hover Preview appears unexpectedly | Cursor rested over a node while narrating | Move the cursor away, or click the intended object (selection takes visual priority) | (no narration needed - it's a normal, expected popover) | n/a | Continue |
| Passport opens the wrong section | `passportTargetSection` was left set from a prior Probe action | Click the correct section heading directly - every section is always rendered, never hidden | "Scrolling to the right section." | Same beat | Continue |
| Guided scenario does not advance | The click didn't land inside the exact `waitForSelection` target, or the target render was mid-transition | Retry the same click; if it still doesn't advance, use Universe Search for the exact object named in the script's Evidence column - selection via Search satisfies the same condition | "Let's confirm that selection." | Same beat | Continue |
| Coachmark target is not visible | The spotlighted node is off-camera or hidden by the active Visual Layers preset | Use Universe Search for the object - both selects it AND (for `cameraFocus` steps) re-triggers the camera move | "One moment - bringing that into view." | Same beat | Continue |
| Visual Layers hides surrounding context | A prior manual category toggle is still active from an earlier free-explore digression | Open the Visual Layers bar → "Reset to Full Enterprise" | "Let's widen back out." | Any beat needing full context | Continue |
| Functional Radar opens the wrong function | Wrong Radar entry point clicked | Close the workspace (✕ / Escape), reopen the correct function | "Let's look at the right function." | Beat L27 | Continue |
| Risk Board recursion is at the wrong depth | A prior drilldown wasn't collapsed | Click the **Enterprise** breadcrumb segment to jump straight back to the root | "Back to the top level." | Beat L26 | Continue |
| Back/Forward history is confusing | Investigation History's Back/Forward stack has unexpected entries from earlier free exploration | Prefer Universe Search over Back/Forward for the rest of the demo; if needed, run **Reset Demo** (clears both history mechanisms) and re-enter via Search | "Let's navigate directly instead." | Re-enter the current beat via Search | Continue |
| Timeline is at the wrong slice | A prior Timeline beat (L29) wasn't returned to baseline | Drag the slider to the rightmost tick, or click the rightmost tick mark directly | "Let's bring the timeline back to today." | Any beat | Continue |
| Browser width causes clipping | Viewport narrower than ~1280px | Widen the window/exit split-screen; if impossible, switch to the fallback tab already sized correctly | (no narration needed if switched before anyone notices) | n/a | Continue |
| First-use invitation appears during a live demo | A Full Demo Reset was run without an intentional plan to show it, or this is genuinely the first run of the day | Click "Explore freely" to dismiss for the session, or "Don't show this again" if it should never reappear | "We'll skip the intro card and go straight in." | Beat L1/S1 | Continue |
| Local preferences differ from rehearsal | A different browser profile/machine has its own saved Visual Layers presets/default | Run **Full Demo Reset** is NOT the fix (it preserves presets by design) - manually reselect Full Enterprise via the Visual Layers bar before starting | (no narration needed if done before the audience arrives) | n/a | Continue |
| Page reload occurs (crash, accidental Cmd/Ctrl+R) | Browser or OS-level interruption | Reload the fallback tab (already loaded, already past initial data fetch); run Reset Demo once it's up | "Let's pick this back up." | Re-enter the current Act via Universe Search for the commitment | Continue if under ~1 minute lost; otherwise switch to the Short route for the remaining time |
| A screenshot or recording must be used as fallback | Live environment genuinely unavailable (network, hardware) | Use pre-captured screenshots (see `docs/DEMO_STATE_AUDIT.md`'s rehearsal report / this PR's screenshot evidence) narrated exactly as the live beats above | "I'll walk you through this with the same real screens, captured live in rehearsal." | n/a | Continue with the narrated-screenshot fallback; do not attempt to fabricate a live recovery under time pressure |

**General rule:** every row above ends in "Continue." Nothing in this
demo has a failure mode severe enough to warrant abandoning the route
entirely - the worst case is falling back from the Long route to the
Short route, or to narrated screenshots, both of which still deliver the
full required narrative (one commitment, one causal chain, one
recommendation/evidence sequence, one alternate perspective, the
governed-knowledge conclusion).
