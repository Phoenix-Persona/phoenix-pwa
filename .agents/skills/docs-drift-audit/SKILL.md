---
name: docs-drift-audit
description: Audit and update Zuka documentation for drift against the current repository. Use when Codex is asked to review, fix, consolidate, or release-polish README.md, AGENTS.md, docs/, test documentation, dev documentation, source comments that point at docs, or any documentation that may be stale after code changes.
---

# Docs Drift Audit

Use this skill to keep Zuka documentation aligned with the current source tree
and easy for users and agents to navigate.

## Workflow

1. Start from the current source of truth:
   - `README.md` for production-facing overview.
   - `docs/INDEX.md` for documentation navigation.
   - `docs/PRODUCT.md` for product model and scope.
   - `docs/ARCHITECTURE.md`, `docs/DATA-FLOW.md`, and source code for implementation truth.
   - `docs/CURRENT-STACK.md` and `package.json` for tooling truth.

2. Build a drift inventory before editing:
   - Search stale anchors:
     ```bash
     rg -n "PROJECT\\.md|dev/PROJECT|Verify page|/verify|Verify\\.tsx|Vite|Vitest|ESLint|components\\.json|useRegisterPersonaLightningAddress|56 files|three test layers" README.md AGENTS.md docs test dev src public
     ```
   - Compare documented routes to `src/AppRouter.tsx`.
   - Compare documented pages, hooks, and components to `rg --files src`.
   - Compare documented scripts and validation commands to `package.json`.
   - Compare security/session claims to `src/App.tsx`, `src/lib/nostrLoginStorage.ts`, `docs/AUTH-SESSION-MODEL.md`, and `docs/THREAT-MODEL.md`.

3. Edit with a clear information architecture:
   - Keep `README.md` concise and release-facing.
   - Keep `docs/INDEX.md` as the navigation hub.
   - Put durable product intent in `docs/PRODUCT.md`.
   - Put implementation maps in `docs/ARCHITECTURE.md` and `docs/DATA-FLOW.md`.
   - Put security details in `docs/AUTH-SESSION-MODEL.md`, `docs/THREAT-MODEL.md`, and `docs/SECURITY-REGRESSION-CHECKLIST.md`.
   - Keep `dev/plans/` and `dev/reports/` historical unless the user explicitly asks to rewrite archives.

4. Remove or reframe stale master-plan language:
   - Do not make deleted plans the source of truth.
   - Do not say future or researched tools are current runtime dependencies.
   - Mark deferred features as deferred instead of documenting missing pages/routes as shipped.

5. Validate documentation:
   - Run a markdown link check:
     ```bash
     node -e 'const fs=require("fs");const path=require("path");const files=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(["node_modules",".git","dist",".tmp"].includes(e.name))continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith(".md"))files.push(p)}}walk(".");let bad=[];for(const f of files){const s=fs.readFileSync(f,"utf8");const re=/\[[^\]]*\]\(([^)]+)\)/g;let m;while((m=re.exec(s))){let target=m[1].trim();if(target.startsWith("http")||target.startsWith("#")||target.startsWith("mailto:"))continue;target=target.replace(/^<|>$/g,"").split("#")[0];if(!target)continue;const resolved=path.resolve(path.dirname(f),target);if(!fs.existsSync(resolved))bad.push(f+": "+m[1])}}if(bad.length){console.error(bad.join("\n"));process.exit(1)}console.log("checked "+files.length+" markdown files; links ok")'
     ```
   - Run `git diff --check`.
   - For source-comment or broad doc changes, run `npm test`; for release prep, prefer `npm run test:ci`.

6. Report and commit:
   - Summarize files changed and any intentional archival exceptions.
   - Include validation evidence.
   - Commit with a docs-scoped message when the task is complete.
