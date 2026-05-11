# Phoenix — Lessons Learned

This file captures patterns, mistakes, and corrections during the Phoenix build.
Per the workflow in `~/.config/opencode/AGENTS.md`, lessons are added after any
correction from the user, with a rule that prevents the same mistake.

---

## Pre-Build Lessons (carried in from prior projects)

### Plan mode is read-only — no exceptions
- Even when explicitly told "build the plan documents," respect plan mode constraints.
- Draft document contents in the response for review; write to disk only after exiting plan mode.

### Verify before declaring done
- Never mark a phase complete without a smoke test.
- For Phoenix specifically: end-to-end smoke test = Anaïse runs the wizard on Device A, content appears on Device B without any shared state besides Nostr relays.

### Don't over-engineer in a hackathon
- V2 features are V2 features. Resist scope creep.
- If V1 is at risk, cut V2 immediately. Shipping V1 polished beats shipping V1+V2 broken.

### Three-way contracts before parallel work
- Lock the schema, the endpoint shape, and the editorial voice spec in hour 1.
- Parallel work without contracts = merge hell at hour 18.

---

## Build Lessons

_Added during the hackathon as corrections come in._

### [Pattern Name]
- **Mistake:**
- **Correction:**
- **Rule for next time:**

---

## Post-Demo Lessons

_To be filled in after the hackathon ends._
