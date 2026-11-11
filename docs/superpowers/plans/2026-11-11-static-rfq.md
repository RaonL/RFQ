# Static RFQ validation implementation plan

**Goal:** Replace the production Flask request path with a static browser application and conservative, inspectable spec comparisons; no Render actions.
**Architecture:** Native ES modules, deterministic parser and evaluator, original reference JSON transformed at build time. No paid API, secrets, server, or upload endpoint. The Python app remains a legacy rollback reference, not the static runtime.
**Tech stack:** Node 22 built-in test runner/build scripts, browser DOM, pinned lazy PDF.js/SheetJS imports for file extraction.
**Spec:** User request on 2026-11-11: code changes for a manually deployed Render Static Site, explain whether an API is necessary.

## Constraints
- Keep main and existing Web Service configuration unchanged; provide render-static.yaml separately.
- Preserve unknown clauses, comparators, units, algorithm context, source text and equipment groups.
- Never infer missing product values, duplicate physical port capacity, or claim legacy values are officially verified.
- Require human review of extraction before displaying candidates. No final automated compliance claim.
- Preserve the existing r12900-DS exclusion by default and show it explicitly.
- Render only escaped text/DOM text nodes; reject oversized uploads. No customer payload in URLs or logs.
- No copying previous-employer material or credentials.

## Tasks and acceptance gates
1. Reproduce original bugs (12 Python regression cases, blob SHA checked); write JS parser/evaluator tests red before implementation.
2. Implement units, multiple metric spans, missing value tracking, residual clauses, grouping, algorithm gating and physical-port allocation; green JS suite.
3. Implement editable extraction UI, local file extraction, comparison/copy/export, invalidation on input edits; browser smoke tests.
4. Implement safe static build, tests, deployment docs and separate Render blueprint; inspect publish folder for Python/secrets.
5. Verify final suite/build/browser flows. Attempt isolated GitHub branch; if connector denies writes, supply exact update archive, no bypass.

## Review focus
- same-line qualitative requirements and qualifiers after a recognized number;
- algorithms and key lengths before versus after TPS;
- formulas, ambiguous spreadsheet columns, zeroes and invalid numeric input;
- cached/stale analysis after editing input or extracted conditions;
- unknown sources, contradictory requirements, and port groups used twice.

## Decisions
Native JS avoids a framework/runtime dependency for this single-screen tool. Fixed-version file libraries load only when requested; failure is explicit and text input remains usable. API-assisted extraction is deliberately not included: client-side secrets would be exposed, and AI output still needs deterministic validation.
