---
name: changelog-release
description: Update Zuka's Keep a Changelog file and prepare release cuts. Use when Codex is asked to add changelog entries, clean changelog format, choose a SemVer version, prepare release notes, cut a release, tag a version, or run release validation.
---

# Changelog Release

Use this skill for `CHANGELOG.md` maintenance and release preparation.

## Changelog Updates

1. Inspect the current change set:
   ```bash
   git status --short
   git diff --stat
   git log --oneline -n 20
   ```

2. Keep `CHANGELOG.md` in Keep a Changelog shape:
   - `## [Unreleased]`
   - `### Added`
   - `### Changed`
   - `### Deprecated`
   - `### Removed`
   - `### Fixed`
   - `### Security`

3. Write entries for users and maintainers:
   - Prefer behavior, docs, tooling, and security impact over commit-by-commit noise.
   - Put dependency removals, deleted files, or retired workflows under `Removed`.
   - Put release-process, documentation, or build/test updates under `Changed`.
   - Put vulnerability hardening or secret-handling changes under `Security`.
   - Leave empty headings in place only if the project has chosen that format; otherwise remove empty headings when cutting a dated release.

4. Coordinate with docs work:
   - If documentation source-of-truth changes, add a concise `Changed` entry.
   - If a large stale document is deleted after migration, add a `Removed` entry.

## Cutting A Release

1. Start clean:
   ```bash
   git status --short
   git fetch origin
   ```

2. Choose a SemVer bump:
   - Patch: bug fixes, documentation-only release prep, internal tooling.
   - Minor: new user-visible capability or workflow.
   - Major: breaking storage/schema/API behavior or intentionally incompatible release.

3. Update release metadata:
   - Move `Unreleased` entries into `## [x.y.z] - YYYY-MM-DD`.
   - Recreate an empty `## [Unreleased]` section above the new release.
   - Update `package.json` and lockfile version when the user asks for a versioned release.
   - Add or update compare links at the bottom if the changelog already uses them.

4. Validate before release claims:
   - Run `npm run test:ci` for a production release.
   - Run any manual release checklist the user requests, especially `test/manual/RELEASE-CHECKLIST.md` for real PPQ, wallet, Blossom, or media spend.
   - Read command output and report actual pass/fail status.

5. Commit and tag only after validation:
   ```bash
   git add CHANGELOG.md package.json package-lock.json
   git commit -m "chore: release vX.Y.Z"
   git tag -a vX.Y.Z -m "vX.Y.Z"
   ```

6. Publishing:
   - Push commits and tags only when the user asks.
   - If creating GitHub releases or PRs, summarize highlights, breaking changes, validation, and known risks.
