/**
 * Normalization vocabulary. Maps the many ways a source can write a term onto one
 * comparison key, so "Zestril", "lisinopril" and "LISINOPRIL" are compared as the
 * same medication. Extend these tables when new synthetic records use new terms.
 *
 * This is a matching aid, not medical knowledge: it never says which term is right.
 */

export interface LexEntry {
  key: string; // canonical normalized label
  display: string;
  aliases: string[]; // lowercase, matched on word boundaries
}

export const MEDICATIONS: LexEntry[] = [
  { key: "lisinopril", display: "Lisinopril", aliases: ["lisinopril", "zestril", "prinivil"] },
  { key: "metformin", display: "Metformin", aliases: ["metformin", "glucophage"] },
  { key: "atorvastatin", display: "Atorvastatin", aliases: ["atorvastatin", "lipitor"] },
  { key: "rosuvastatin", display: "Rosuvastatin", aliases: ["rosuvastatin", "crestor"] },
  { key: "metoprolol succinate", display: "Metoprolol succinate", aliases: ["metoprolol succinate", "metoprolol er", "toprol xl", "toprol-xl"] },
  { key: "metoprolol tartrate", display: "Metoprolol tartrate", aliases: ["metoprolol tartrate", "lopressor"] },
  { key: "apixaban", display: "Apixaban", aliases: ["apixaban", "eliquis"] },
  { key: "aspirin", display: "Aspirin", aliases: ["aspirin", "asa"] },
  { key: "amlodipine", display: "Amlodipine", aliases: ["amlodipine", "norvasc"] },
  { key: "hydrochlorothiazide", display: "Hydrochlorothiazide", aliases: ["hydrochlorothiazide", "hctz"] },
  { key: "levothyroxine", display: "Levothyroxine", aliases: ["levothyroxine", "synthroid"] },
  { key: "omeprazole", display: "Omeprazole", aliases: ["omeprazole", "prilosec"] },
  { key: "furosemide", display: "Furosemide", aliases: ["furosemide", "lasix"] },
  { key: "warfarin", display: "Warfarin", aliases: ["warfarin", "coumadin"] },
  { key: "albuterol", display: "Albuterol", aliases: ["albuterol"] },
  { key: "sertraline", display: "Sertraline", aliases: ["sertraline", "zoloft"] },
];

export const CONDITIONS: LexEntry[] = [
  { key: "hypertension", display: "Hypertension", aliases: ["hypertension", "htn", "high blood pressure", "essential hypertension"] },
  { key: "type 2 diabetes mellitus", display: "Type 2 diabetes mellitus", aliases: ["type 2 diabetes mellitus", "type 2 diabetes", "t2dm", "dm2", "diabetes mellitus type 2", "type ii diabetes"] },
  { key: "type 1 diabetes mellitus", display: "Type 1 diabetes mellitus", aliases: ["type 1 diabetes mellitus", "type 1 diabetes", "t1dm"] },
  { key: "prediabetes", display: "Prediabetes", aliases: ["prediabetes", "pre-diabetes", "impaired fasting glucose"] },
  { key: "diabetes (unspecified)", display: "Diabetes", aliases: ["diabetes"] },
  { key: "hyperlipidemia", display: "Hyperlipidemia", aliases: ["hyperlipidemia", "dyslipidemia", "high cholesterol", "hypercholesterolemia"] },
  { key: "atrial fibrillation", display: "Atrial fibrillation", aliases: ["atrial fibrillation", "afib", "a-fib", "a fib"] },
  { key: "palpitations", display: "Palpitations", aliases: ["palpitations"] },
  { key: "chest pain", display: "Chest pain", aliases: ["chest pain"] },
  { key: "asthma", display: "Asthma", aliases: ["asthma"] },
  { key: "hypothyroidism", display: "Hypothyroidism", aliases: ["hypothyroidism"] },
  { key: "chronic kidney disease", display: "Chronic kidney disease", aliases: ["chronic kidney disease", "ckd"] },
  { key: "heart failure", display: "Heart failure", aliases: ["heart failure", "chf"] },
  { key: "obesity", display: "Obesity", aliases: ["obesity"] },
  { key: "gerd", display: "GERD", aliases: ["gerd", "gastroesophageal reflux disease", "acid reflux"] },
  { key: "left ventricular hypertrophy", display: "Left ventricular hypertrophy", aliases: ["left ventricular hypertrophy", "lvh"] },
  { key: "myalgia", display: "Myalgia", aliases: ["myalgia", "myalgias"] },
];

/**
 * Sets of condition keys that two sources should not both assert as current for the
 * same person. If one source says A and another says B, that is surfaced for review.
 */
export const MUTUALLY_EXCLUSIVE_CONDITIONS: string[][] = [
  ["type 2 diabetes mellitus", "type 1 diabetes mellitus", "prediabetes"],
];

export const ALLERGENS: LexEntry[] = [
  { key: "penicillin", display: "Penicillin", aliases: ["penicillin", "penicillins", "pcn"] },
  { key: "sulfonamide antibiotics", display: "Sulfonamide antibiotics", aliases: ["sulfa", "sulfa drugs", "sulfonamide", "sulfonamides", "sulfamethoxazole"] },
  { key: "codeine", display: "Codeine", aliases: ["codeine"] },
  { key: "latex", display: "Latex", aliases: ["latex"] },
  { key: "peanut", display: "Peanut", aliases: ["peanut", "peanuts"] },
  { key: "shellfish", display: "Shellfish", aliases: ["shellfish"] },
  { key: "iodinated contrast", display: "Iodinated contrast", aliases: ["iodinated contrast", "contrast dye", "iv contrast"] },
];

export const LABS: (LexEntry & { units?: string })[] = [
  { key: "hemoglobin a1c", display: "Hemoglobin A1c", aliases: ["hemoglobin a1c", "hba1c", "a1c", "glycated hemoglobin"], units: "%" },
  { key: "ldl cholesterol", display: "LDL cholesterol", aliases: ["ldl cholesterol", "ldl-c", "ldl"], units: "mg/dL" },
  { key: "hdl cholesterol", display: "HDL cholesterol", aliases: ["hdl cholesterol", "hdl-c", "hdl"], units: "mg/dL" },
  { key: "total cholesterol", display: "Total cholesterol", aliases: ["total cholesterol", "cholesterol, total"], units: "mg/dL" },
  { key: "triglycerides", display: "Triglycerides", aliases: ["triglycerides", "tg"], units: "mg/dL" },
  { key: "creatinine", display: "Creatinine", aliases: ["creatinine", "serum creatinine", "cr"], units: "mg/dL" },
  { key: "potassium", display: "Potassium", aliases: ["potassium", "k"], units: "mmol/L" },
  { key: "sodium", display: "Sodium", aliases: ["sodium", "na"], units: "mmol/L" },
  { key: "glucose", display: "Glucose", aliases: ["glucose", "fasting glucose", "blood glucose"], units: "mg/dL" },
  { key: "egfr", display: "eGFR", aliases: ["egfr", "estimated gfr"], units: "mL/min/1.73m2" },
  { key: "tsh", display: "TSH", aliases: ["tsh", "thyroid stimulating hormone"], units: "mIU/L" },
  { key: "hemoglobin", display: "Hemoglobin", aliases: ["hemoglobin", "hgb"], units: "g/dL" },
  { key: "bnp", display: "BNP", aliases: ["bnp", "b-type natriuretic peptide"], units: "pg/mL" },
  { key: "lvef", display: "LVEF", aliases: ["lvef", "ejection fraction", "left ventricular ejection fraction"], units: "%" },
];

export const IMAGING: LexEntry[] = [
  { key: "transthoracic echocardiogram", display: "Transthoracic echocardiogram", aliases: ["transthoracic echocardiogram", "tte", "echocardiogram", "echo"] },
  { key: "chest x-ray", display: "Chest X-ray", aliases: ["chest x-ray", "chest xray", "cxr", "chest radiograph"] },
  { key: "ct chest", display: "CT chest", aliases: ["ct chest", "chest ct"] },
  { key: "electrocardiogram", display: "Electrocardiogram", aliases: ["electrocardiogram", "ecg", "ekg"] },
  { key: "renal ultrasound", display: "Renal ultrasound", aliases: ["renal ultrasound"] },
];

export const PROCEDURES: LexEntry[] = [
  { key: "colonoscopy", display: "Colonoscopy", aliases: ["colonoscopy"] },
  { key: "electrical cardioversion", display: "Electrical cardioversion", aliases: ["electrical cardioversion", "cardioversion", "dccv"] },
  { key: "transesophageal echocardiogram", display: "Transesophageal echocardiogram", aliases: ["transesophageal echocardiogram", "tee"] },
  { key: "cardiac catheterization", display: "Cardiac catheterization", aliases: ["cardiac catheterization", "heart cath"] },
  { key: "appendectomy", display: "Appendectomy", aliases: ["appendectomy"] },
  { key: "cholecystectomy", display: "Cholecystectomy", aliases: ["cholecystectomy"] },
];

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface LexMatch {
  entry: LexEntry;
  alias: string;
  index: number;
  length: number;
}

/** Find every lexicon term in `text`, preferring the longest alias at a position. */
export function findTerms(text: string, table: LexEntry[]): LexMatch[] {
  const lower = text.toLowerCase();
  const hits: LexMatch[] = [];
  for (const entry of table) {
    for (const alias of entry.aliases) {
      const re = new RegExp(`(?<![a-z0-9])${escapeRe(alias)}(?![a-z0-9])`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(lower))) {
        hits.push({ entry, alias, index: m.index, length: alias.length });
      }
    }
  }
  // Longest match wins; drop matches nested inside a longer one.
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  const out: LexMatch[] = [];
  for (const h of hits) {
    const prev = out[out.length - 1];
    if (prev && h.index < prev.index + prev.length) continue;
    out.push(h);
  }
  return out;
}

/** Look up a whole label (e.g. a list item) and return its canonical entry if any. */
export function lookup(label: string, table: LexEntry[]): LexEntry | null {
  const clean = label.toLowerCase().trim();
  for (const entry of table) if (entry.aliases.includes(clean)) return entry;
  const hits = findTerms(label, table);
  return hits.length ? hits[0].entry : null;
}

/** Fallback key for terms not in the lexicon: lowercase, collapse punctuation. */
export function fallbackKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
