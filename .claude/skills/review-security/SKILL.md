---
name: review-security
description: "Security check of this repo: authorization leaks across roles, chain bypass, agent token scope, audit log integrity, injection/XSS, secrets and dependencies, each finding reproduced. Use when the user asks for a security check / güvenlik kontrolü, or before a demo or release."
---

Hunt for ways a user, or an agent acting for one, can see or change more than the authorization model allows (ADR-0001), or hide what they did (ADR-0002). Every finding is reproduced before it is called confirmed.

## Steps

1. **Pin the scope.** Default: the whole codebase. If the user named a fixed point, review `git diff <fp>...HEAD` and the code it touches.
2. **Automated sweep.** Record each command and its result:
   - `npm audit --omit=dev`, then `npm audit`.
   - Grep `src/` for `$queryRaw`, `$executeRaw`, `Unsafe`, `dangerouslySetInnerHTML`, `eval(`, `child_process`, and hard-coded secrets, tokens or passwords. Check git for a committed `.env`.
   - For every route in `src/server/http/*.ts`, confirm it resolves the actor through `handler(...)`. List each `public: true` route and why it is public.
3. **Build the access matrix.** For each public method of each service (`src/server/modules/*/index.ts`, registry in `src/server/services.ts`): its gate (`oku`/`yaz`), the roles that may call it, the rows it returns. Then work through every threat in _Threats_ against the matrix.
4. **Reproduce each candidate.** Preferred: a scratch seam test using `useTestDb` (`test/harness.ts`) that acts as the attacker from `F` (`src/server/seed/fixture.ts`). Alternative: a live probe against `npm run dev` with mock tokens. Reproduced means CONFIRMED; traced but not run means PLAUSIBLE.
5. **Clean up.** Delete the probe files unless the user wants them kept as regression tests. Stop any dev server, then confirm no `src/server/dev.ts` or embedded `postgres` process remains.
6. **Report.** One entry per finding: severity (critical / high / medium / low), CONFIRMED or PLAUSIBLE, threat, `file:line`, repro (actor, request, observed vs expected), fix. Then a short **Known demo-only gaps** section for the items under that heading below, kept apart so they don't drown real findings.

Done when every route and every service method appears in the matrix and every threat has been checked against it.

## Threats

- **IDOR:** reading or changing a Task, Etkinlik, Yetkinlik or Bildirim by id that the actor cannot see: `GET`/`PATCH /:id`, `/kabul/tasks/:id/*`, `/tasks/:id/durum`, `/bildirim/:id/okundu`.
- **List leaks:** a `KABUL_BEKLIYOR` Task visible to the target's Ekip arkadaşları; member lists of other Ekipler; a Çalışan's rapor showing the ranking or other Ekipler; the user directory exposing more than an Assignee picker needs.
- **Vertical escalation:** a Çalışan changing roles or structure; a Team Head acting outside their Ekip; a Unit Head outside their Unit; a Vekil approving their own request.
- **Chain bypass:** jumping status past acceptance; acting on a chain step assigned to someone else; accepting after a refusal; a Requester approving their own request where the spec requires another approver.
- **Agent scope:** a read-only agent token writing; an agent action missing the `ajan` flag in the denetim izi.
- **Audit integrity:** a code path that updates or deletes `DenetimKaydi`, or writes business rows outside `yaz`; any way around the database no-delete trigger.
- **Mass assignment:** a request body passed into Prisma `data`, letting the client set `durum`, `requesterId`, roles or ids.
- **Input:** missing validation, oversized payloads, file attachment type and size once attachments exist.
- **Output:** stack traces or internals leaked by the error handler; XSS through `dangerouslySetInnerHTML` or user-supplied `href`s (`javascript:`).
- **Web config:** CORS, security headers, where the web client stores its token.

## Known demo-only gaps

Mention these briefly in their own section rather than as findings: mock login with forgeable `mock:<userId>` bearer tokens (the spec requires only an SSO-ready design), no rate limiting, no TLS in dev, and embedded Postgres default credentials.
