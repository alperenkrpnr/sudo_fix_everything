---
name: review-ux
description: "UX review of this repo's web app: walks each role's flows in the running app and reports usability, clarity, accessibility and consistency problems with concrete fixes. Use when the user asks for a UX review / kullanılabilirlik incelemesi, or how the demo screens feel."
---

Walk the app as each role and report what makes a flow slow, confusing, error-prone or inaccessible, with a concrete fix per problem.

## Steps

1. **Pin the scope.** Default: every page registered in `SAYFALAR` (`src/web/App.tsx`, pages in `src/web/pages/`) and every flow in _Flows_. If the user named pages or flows, restrict to them.
2. **Launch.** Start `npm run dev` in the background and wait for its `Siber Task  http://localhost:<port>` line. If you can drive a browser (the `run` skill), screenshot each screen per role. Otherwise review from the page source plus live API responses: `POST /api/oturum/giris {"kullaniciId": "<id>"}` returns a bearer token, which shows the real data each role gets. Name the mode you used in the report.
3. **Walk every flow** as its role, and judge each screen against _Heuristics_.
4. **Stop the server.** Kill the dev process and confirm no `src/server/dev.ts` or embedded `postgres` process remains (`pgrep -fl "src/server/dev.ts|embedded-postgres"`).
5. **Report** per flow: step, problem, heuristic, severity (blocker / major / minor / polish), fix (naming the component file). Open with the five problems that most hurt a live demo.

Done when every flow has been walked and every page has been visited by at least one role.

## Flows

Mock users and their ids are in `src/server/seed/fixture.ts` (`F`).

- **Çalışan (waf1):** log in → Bekleyen işlerim → create a Task for a Çalışan in another Unit (cti1) → find it in Kabul Bekliyor.
- **Çalışan (cti1):** accept that Task; refuse another one with a ret gerekçesi.
- **Team Head (thCti):** approve from Bekleyen işlerim; move a card Devam Ediyor → Bloklu (with reason) → Tamamlandı; open its tarihçe.
- **Team Head over several Ekipler (thCoklu):** work across both Ekipler from one view.
- **Unit Head (uhSavunma):** Rapor with the Unit/Ekip filter; an Organizasyon edit.
- **Direktör:** Rapor across Units; denetim izi; a Duyuru to the Direktörlük.
- **Any role:** answer an Etkinlik invite, add a Yetkinlik, read Bildirimler.

## Heuristics

- **Nielsen's ten heuristics** are the frame: visibility of system status, match with the domain, user control and freedom, consistency, error prevention, recognition over recall, efficiency, minimalist design, error recovery, help.
- **Wording:** Turkish UI text using GLOSSARY terms (Task, Ekip, Requester, Assignee, Kabul Bekliyor…), identical across pages.
- **Role clarity:** the user always sees who they are logged in as and in which role. A page a role cannot use is hidden or says why.
- **Task cards:** status, who the Task waits on (the current chain step), and due date at a glance. Overdue stands out.
- **Empty states:** say what will appear and how to create the first item.
- **Errors:** API errors (`{hata, mesaj}`) appear as readable messages next to the action, never silently or as raw JSON.
- **Native dialogs:** `window.prompt` / `alert` for a gerekçe or reason is major: no validation, no context, and it looks unfinished in a demo.
- **Accessibility:** labelled inputs, keyboard reach, visible focus, colour never the only signal (status, overdue), sufficient contrast.
- **Layout:** laptop/projector widths (1280–1440px) first, then a narrow window.
