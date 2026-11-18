---
name: review-code
description: "Defect review of this repo's code: bugs, breaks of the authorization layer (ADR-0001) and audit/history (ADR-0002) rules, convention drift, missing seam tests. Every finding is reproduced. Use when the user asks for a code review / kod incelemesi of a branch, diff or module in this project."
---

Review the code between a fixed point and `HEAD` for **defects**: places where the code does the wrong thing, breaks a project rule, or lacks the test that would catch it. For the generic two-axis Standards/Spec diff review, use `code-review` instead.

## Steps

1. **Pin the scope.** The fixed point is what the user named; default `main`. Run `git diff <fp>...HEAD --stat` and `git log <fp>..HEAD --oneline`. A bad ref or empty diff stops here. If the user named a module or path, restrict to it.
2. **Run the gates.** `npm run typecheck` and `npm test`. Each red gate is a finding; quote the failure.
3. **Check every changed file against every rule in _Rules_.** For a diff over ~15 files, fan out: one subagent per touched directory under `src/server/modules/`, plus one for `src/server/http/` and `src/web/`. Give each the diff command, its paths, and the path of this file's _Rules_ section; collect their candidates.
4. **Verify each candidate.** Make it concrete: a failing seam test (`useTestDb` from `test/harness.ts`, actors from `F` in `src/server/seed/fixture.ts`) or an input traced through the code to a wrong outcome. Mark it CONFIRMED (reproduced) or PLAUSIBLE (traced, not run). Drop what you cannot make concrete. Delete probe tests afterwards unless the user wants them kept as regression tests.
5. **Report** with the `ReportFindings` tool, most severe first, each with `file:line`, the defect, its failure scenario (input → wrong outcome) and the verdict. Without that tool, print the same as a ranked list.

Done when every changed file has met every rule and every reported finding carries a failure scenario.

## Rules

### Authorization (`docs/adr/0001-tek-yetki-servis-katmani.md`)
- Every public service method takes an `Actor` first and runs inside exactly one `oku`/`yaz` gate from `src/server/modules/yetki`.
- Visibility, edit, approval, Sorumlu yönetici, Üst yönetici and Vekil logic lives only in `src/server/modules/yetki/`. A permission decision in another module, in `src/server/http/`, or in `src/web/` is a defect: a second copy of a rule that will drift.
- HTTP routes (and MCP tools) only translate request → service call → response.
- Agent actors are read-only unless the token carries `yazma`, and see exactly what their user sees.

### History and audit (`docs/adr/0002-eklemeli-denetim-izi-ve-tarihsel-yapi.md`)
- Business writes go through `yaz`, so a `DenetimKaydi` is written. Business rows are archived, never deleted.
- Date-ranged org rows (`Uyelik`, `Yoneticilik`) end by setting `gecerliBitis`; a move ends the old row and creates a new one.
- Service code reads time from `kimlik.zaman` / `ctx.now()`. A bare `new Date()` breaks the test clock and historical resolution.
- Resolution helpers in `yetki/cozumleme.ts` take a time `t`. Reports must resolve the structure at event time; the `rapor` module has an open TODO here, so flag new code that deepens it.

### Domain (`docs/*/spec.md`, `GLOSSARY.md`)
- Behaviour matches the spec sections "Kabul zinciri kuralları", "Durum makinesi" and "Görünürlük".
- Guard rails hold: ret gerekçesi required, Bloklu reason required, no start while `KABUL_BEKLIYOR`, Requester only cancels, a refused Task is kept.
- Identifiers and UI text use GLOSSARY terms; a term listed under _Avoid_ is a finding.

### Codebase conventions
- New `.prisma` files reference Kullanici/Ekip/Unit by plain `String` id columns, without `@relation`.
- Errors come from `src/server/core/errors.ts`, so the adapter maps them to the right HTTP status.
- `src/web` imports server code with `import type` only.
- Seam tests act and assert through services. Arranging past org state via `t.db` is fine; asserting via `t.db` is a finding.
- Each new rule has a seam test that goes red without it.
