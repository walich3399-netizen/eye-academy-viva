# Write-up: voice viva take-home

> Fill the `⟨…⟩` slots from your own live run before sending. Everything not in a slot was observed (automated tests / build) and is labelled as such.

## 1. What works, and where I stopped

**Built and verified by automated tests + `vite build` + `tsc --noEmit`:**
- Finding lookup (eye, value, unit preserved; unavailable findings declared; unknown requests never invented) — 12 tests.
- Reference-note preprocessing (10 pages → 84 page-tagged chunks) and BM25 retrieval — 4 tests.
- Revision-point pipeline in its no-API-key path, with the citation validator — 2 tests.
- App builds; dev server serves the shell (HTTP 200).

**Exercised live in Chrome (typed input, Google sign-in, real Firebase project):** sign-in, a full viva, refresh restoring transcript and revealed findings, attempt list, no console or Firestore permission errors. **Not yet exercised:** the microphone/speech loop, and the Claude-written follow-up and revision point (no API key was set; the rule-based fallback ran). ⟨Update after your own mic run and API-key run.⟩

**Where I stopped (⟨time spent⟩ h):** ⟨e.g. “stopped at 4h; had not tested Safari/Firefox; no Firestore-rules unit tests”⟩. Known gaps: Web Speech recognition is Chrome/Edge only (typed fallback exists); no barge-in (mic is off while the examiner speaks, deliberately, to avoid the TTS being transcribed); no emulator-based rules test.

## 2. Model choice and responsiveness

**Choice:** browser-native speech (Web Speech `SpeechRecognition` for speech-to-text, `speechSynthesis` for text-to-speech), with a text LLM (`claude-haiku-5-5`) used only for the follow-up question and the revision point.

**Why:** the part that must be exactly right (eye, value, units) is a deterministic lookup, so the finding read-back never depends on a model. Browser speech needs no extra key or cost, streams interim text, and the turn-time cost is almost entirely the recogniser's end-of-speech detection plus a sub-millisecond lookup. A speech-to-speech model would sound more natural but would put generated speech between the case JSON and the trainee, so “58 mmHg right eye” could be re-worded or mis-stated.

**Alternative considered:** OpenAI Realtime API (speech-to-speech). Better naturalness and barge-in; rejected for the accuracy risk above and because it adds a paid dependency and a second vendor key. If the examiner dialogue became open-ended, I would revisit it and keep the finding read-back as a tool call.

**Timer:** starts when the recogniser delivers its **final transcript** (`onresult` with `isFinal`, or Enter for typed input). Stops on the `speechSynthesis` utterance `onstart` event, i.e. when examiner audio begins. It does *not* include the trainee speaking or the recogniser's silence timeout before the final result. The server function time is shown separately.

| Turn | Request | Server fn (ms) | Final transcript → first audio (ms) |
|---|---|---|---|
| 1 | “What is the intraocular pressure in the right eye?” (typed; first turn after page load) | 942 | 2097 |
| 2–5 | gonioscopy, visual field, medications, pupils (typed) | ⟨not recorded per turn⟩ | 894 to 1085 |
| – | follow-up question, no API key (rule-based) | ⟨ ⟩ | ⟨ ⟩ |

These were typed turns driven through Chrome, so the timer started at Send, not at a speech recogniser result. ⟨Add 2–3 spoken turns from your own mic.⟩ The first turn is slow because of cold start (key fetch + first token check); I added a key-cache warm-up at server start but have not re-measured.

(Both numbers are printed under each examiner message in the app and stored in the attempt.)

## 3. Three repeatable checks

Run automatically with `npm test`; each can also be done by hand in the app (typed or spoken).

| # | Check | Expected | Observed (automated) | Observed (live) |
|---|---|---|---|---|
| 1 | Available finding: “What's the intraocular pressure in the right eye?” | Reveals `iop_right`; screen “58 mmHg”; spoken “Intraocular pressure, right eye: 58 millimetres of mercury, Goldmann applanation, 23:55.” Left-eye 18 is not mentioned. | ✅ id `iop_right`, display `58 mmHg`, spoken text as expected, no “18” | ✅ Chrome run: screen showed “Intraocular pressure (right): 58 mmHg”, badge RIGHT, no left value |
| 2 | Unavailable finding: “Gonioscopy of the right eye” | Marked unavailable with reason “No view: corneal oedema”; spoken “…not available…”; no value invented. Also: “visual field” (not in case) → “I don't have that finding available”. | ✅ `available:false`, reason `No view: corneal oedema`; unknown request returns `kind:'unknown'`, no items | ✅ Chrome run: “Not available”; reason was only in the findings panel at first, now also in the examiner reply (fixed after this run) |
| 3 | Citation supports the revision point. Trainee answer omits the sulfonamide-allergy check before acetazolamide | Revision point on checking sulfonamide allergy; cited page contains that sentence verbatim | ✅ (no-API-key path) Pages retrieved: **6, 8, 9, 5, 5, 7** (chunks p6-c1, p8-c4, p9-c7, p5-c6, p5-c9, p7-c2). Cited **page 6**, chunk p6-c1: “Check for sulfonamide allergy, kidney disease, low potassium and sickle cell disease before giving it.” Validator confirms the excerpt is verbatim in the stored chunk. | ⟨With API key: pages retrieved / passage cited / does the sentence support the point? Y/N⟩ |

Citation safety: the page number and excerpt come from the stored chunk. If the model's quote is not verbatim in the chosen chunk it is replaced by the closest sentence from that chunk (flag shown under “How this was found”). If nothing scores above a threshold, or the model returns `supported:false`, the trainee is told no support was found.

## 4. Short handover

**Preparing the note.** `scripts/prepare-note.mjs` runs `pdftotext -layout` per page, strips the running header/footer, splits into paragraph blocks, tracks the section/sub-section heading (known H2 titles reset the breadcrumb), and splits blocks longer than ~70 words at sentence boundaries. A chunk never crosses a page, so the page number is always the real printed page (note pages equal PDF pages). Output: `data/note-chunks.json`, committed so the demo needs no tooling.

**Selecting passages.** Two steps so the revision point is about the *trainee's* answer, not just the case: (1) the model picks the single most important gap in their transcript (hidden examiner key points help it prioritise) and emits a keyword query; (2) BM25 (section heading weighted ×2) retrieves the top 6 chunks; (3) the model writes one point from those passages only and quotes one; (4) code validates the quote and takes the page from the chunk. The note's non-acute sections (aqueous physiology, POAG, drug table) act as distractors; BM25 plus the “passages only / `supported:false`” instruction handles them. Known weakness: table rows lose their first-column labels in `pdftotext` (differential-diagnosis table, p4–5), and long bullets are cut across chunks.

**AI coding tool, one concrete example.** ⟨Edit to your own account.⟩ In this build the assistant generated the spoken-text formatter (`toSpoken`). Raw values like `6/36` risk being read as a date by text-to-speech and `mmHg` is mispronounced; it also avoids saying “5 mm mm” where the case value already carries its unit. I verified it by unit tests against the actual case JSON (VA read as “6 over 9”, pupil value not double-unit'd, refraction left unchanged), and by listening to it in the browser ⟨confirm you did⟩.

**Improvement I'd prioritise next.** Per-key-point coverage: tick which of the examiner's six key points the trainee covered and rank the revision point by safety (sulfonamide check before acetazolamide, fellow-eye iridotomy). Reason: the single revision point currently depends on one model judgement; a visible checklist makes marking auditable and gives a deterministic fallback.

**Costs.** AI API spend: ⟨£ …⟩ — receipt/usage screenshot attached ⟨yes/no⟩.
