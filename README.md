# Eye Academy voice viva (take-home)

TanStack Start + Firebase Auth + Firestore. One fictional case (EA-VIVA-001), one reference note.

## Run it

Prerequisites: Node 20+, Chrome or Edge (Web Speech API), a Firebase project with **Authentication** (Google and/or Email/Password) and **Firestore** enabled.

```bash
npm install
cp .env.example .env          # fill the 4 VITE_FIREBASE_* values; ANTHROPIC_API_KEY is optional
npx firebase-tools deploy --only firestore:rules   # or paste firestore.rules in the console
npm run dev                   # http://localhost:3000
npm test                      # 18 automated checks (no network, no API key needed)
```

`data/note-chunks.json` is committed. To rebuild it from the PDF: `npm run prep:note` (needs `pdftotext`).

Without `ANTHROPIC_API_KEY` the app still works: the follow-up is picked from the examiner's prompts by rule and the revision point is extractive (best sentence of the best passage). With a key, Claude writes the follow-up and the revision point.

## How it works

| Brief item | Where |
|---|---|
| Ask for findings aloud, correct eye/value/units, "unavailable" | `src/lib/findings.ts` — deterministic parser + formatter. **No LLM in this path.** |
| One spoken follow-up that responds to the trainee | `askFollowUp` → `src/lib/llm.server.ts` |
| Clear speaking / examiner-responding states | `Viva.tsx` status bar (idle / listening / thinking / speaking), mic disabled while the examiner talks |
| Saved, private attempts | Firestore `attempts`, `firestore.rules` (owner-only read/write, `ownerUid` immutable) |
| Revision point with page + excerpt | `revisionPoint` → BM25 over `data/note-chunks.json`; page/excerpt always come from the stored chunk |
| Examiner notes stay hidden | only server functions import `data/case.json`; the client receives the header + revealed findings |

Server functions verify the Firebase ID token (`jose` + Google's public keys, project id only).

## Status

See [WRITEUP.md](WRITEUP.md) for what works, where I stopped, the latency measurement, the three checks and the handover.
