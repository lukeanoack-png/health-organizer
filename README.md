# Record Organizer — synthetic health-record organizer (prototype)

> **Educational prototype using synthetic data only. Not for diagnosis, treatment, or medical decision-making.**
> Do not upload real medical records or personally identifiable health information, including your own.

Upload several **synthetic** health documents from different fictional sources. The app extracts facts,
keeps a link from every fact to the exact passage it came from, builds a timeline, and **surfaces where
sources disagree without deciding which source is right**. The app organizes evidence. Humans interpret it.

## Run it

Needs Node.js 20.9+.

```bash
cd tools/health-organizer
npm install
npm run dev          # http://localhost:3000 → click "Load Demo Records"
```

On Windows you can double-click `start_health_organizer.bat` at the repo root instead.

| Command | What it does |
|---|---|
| `npm test` | 25 tests: conflict rules, provenance, ingestion (TXT/CSV/DOCX/PDF), Ask Records, demo dataset |
| `npm run typecheck` | TypeScript check |
| `npm run build && npm start` | Production build (the page is fully static) |
| `npm run dump` | Prints every fact, conflict and timeline event extracted from the demo records |
| `npm run ask -- "question"` | Runs Ask Records from the command line against the demo records |

## Deploy

The app has no server code, API keys, or database. Files are parsed in the browser.

- **Vercel**: import the repo, set *Root Directory* to `tools/health-organizer`, deploy. Defaults work.
- **Any static host** (GitHub Pages, Netlify): add `output: "export"` to `next.config.mjs`, run
  `npm run build`, and publish the generated `out/` folder.

A deployed copy is public. Keep it to synthetic demo data.

## Architecture

```
files ─► lib/ingest ─► RawDocument (text kept verbatim, never modified)
              │
              ▼
         lib/extract  (Extractor interface; rules today, LLM later)
              │   verifyProvenance: drop any fact whose quote isn't literally in the document
              ▼
            Fact[] ──► lib/conflicts/detect   (references fact IDs only; never edits facts)
              │   └──► lib/timeline/build
              └──────► lib/query/ask          (cited answers, refusals, "insufficient evidence")
                              │
                        components/  (presentation only)
```

| Folder | Responsibility |
|---|---|
| `lib/types.ts` | Data model: `RawDocument`, `Fact` (with `SourceRef`), `Conflict`, `ConflictAnnotation`, `TimelineEvent` |
| `lib/ingest/` | Bytes to text. TXT/CSV are decoded, DOCX is unzipped with the platform inflater, PDF goes through `unpdf` (with page spans). Reads header metadata |
| `lib/normalize/` | `lexicon.ts` (brand/generic names, abbreviations, mutually exclusive diagnoses), `values.ts` (dates, doses, frequencies) |
| `lib/extract/` | `rules.ts` is the rule extractor. `index.ts` holds the `Extractor` interface and `verifyProvenance`. `llm.ts` is a placeholder showing how to plug in a model |
| `lib/conflicts/detect.ts` | Conflict rules (see below) |
| `lib/timeline/`, `lib/query/` | Timeline events and Ask Records |
| `lib/annotations.ts` | Review labels in browser localStorage, separate from the evidence |
| `components/` | UI: `AppShell`, `ConflictCard`, `SourceDrawer`, `UploadPanel`, `views/*` |

### Provenance

Every `Fact` carries `source.documentId`, `documentName`, `documentType`, `provider`, `facility`, `recordDate`,
`section`, `page`, `excerpt`, `charStart`/`charEnd`, plus `confidence` and `extractor`. The UI never shows a
fact without a source chip. Clicking the chip opens the original document with the passage highlighted.
Confidence describes how structured the source line was (table row, list item, or free text). It is not
a measure of whether the fact is true.

### Conflict detection

| Rule | Example in the demo |
|---|---|
| Same medication, different dose/frequency | Lisinopril 10 mg (primary care) vs 20 mg (cardiology) |
| Listed as current after a record of discontinuation | Atorvastatin discontinued Apr 2, listed again Apr 15 |
| Allergy recorded vs "no known drug allergies" / denied | Penicillin vs NKDA |
| Allergy reaction differs | Hives vs anaphylaxis |
| Condition recorded vs explicitly denied | Atrial fibrillation vs "No history of atrial fibrillation" |
| Mutually exclusive diagnoses | Type 2 diabetes vs prediabetes |
| Same test and date, different value | LDL 162 vs 126 on Jan 15 |
| Same study, dates within 60 days differ | Echo Mar 20 (report) vs Mar 2 (as referenced) |
| Demographics differ | DOB 07/14/1968 vs 04/17/1968 |

Each conflict is labelled `unexplained` or `documented_change`. The second label applies when a record
explicitly documents a change (e.g. "increased from 25 mg to 50 mg") that falls between the differing
records. Both kinds appear in the Conflicts panel, and neither is resolved automatically. Identical
repeated facts count as corroboration, not conflict, and a missing item is not treated as a contradiction.

Review statuses (Unresolved / Reviewed / Explained by timeline / Likely documentation error) and notes
are annotations stored separately. They never change or hide evidence. If new documents change a
conflict's evidence after it was reviewed, the card shows "New evidence since review".

## Replacing the demo records with the final synthetic dataset

1. Put the files in **`public/demo-records/`**. TXT, CSV, DOCX and PDF all work. Put `SYNTHETIC` in each
   file (the app flags files without it).
2. List them in **`public/demo-records/manifest.json`**.
3. Run `npm run dump` and check what was extracted. Things to adjust if needed:
   - Header field names (e.g. a new "Clinician:" label): `KEY_MAP` in `lib/ingest/header.ts`
   - Section headings (e.g. "MED REC:"): `KIND_RULES` in `lib/extract/sections.ts`
   - New drugs, conditions, labs, allergens, or brand names: `lib/normalize/lexicon.ts`
   - CSV column names: `csvFacts` in `lib/extract/rules.ts`
4. Update the `EXPECTED` block in **`tests/demo-and-ask.test.ts`** to list the conflicts the new dataset is
   designed to contain, then run `npm test`.

Records work best with a `Key: value` header (Document Type, Facility, Provider, Date of Service, Patient,
DOB) followed by `UPPERCASE HEADING:` sections with `-` bulleted items. See the current demo files.

## Limits (honest list)

- Extraction is rule-based. Free-text sentences are only used when a clear cue is present ("started",
  "discontinued", "increased from…to…", "denies", "no history of"), so unusual phrasing can be missed.
- Conflict detection can miss disagreements that the rules don't cover, and absence of a conflict is
  not proof of agreement.
- Scanned PDFs and images are not OCR'd.
- Loaded documents live in memory only. Reloading the page clears them, which is intentional.
