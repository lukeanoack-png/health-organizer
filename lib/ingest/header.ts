/**
 * Reads the "Key: value" header block that synthetic records carry at the top, e.g.
 *
 *   SYNTHETIC — NOT A REAL PATIENT
 *   Document Type: Cardiology Consultation
 *   Provider: Thomas Okafor, MD (fictional)
 *   Date of Service: 2026-03-12
 *
 * Every field keeps its character offsets so facts derived from it (DOB, sex, visit)
 * can point at the exact line.
 */
import type { DocumentMeta, DocumentType } from "../types";
import { parseDate } from "../normalize/values";

export type HeaderKey =
  | "documentType"
  | "facility"
  | "provider"
  | "recordDate"
  | "patientName"
  | "dob"
  | "sex"
  | "admissionDate"
  | "dischargeDate"
  | "collectionDate";

export interface HeaderField {
  key: HeaderKey;
  rawKey: string;
  value: string;
  start: number; // offset of the line start
  end: number; // offset of the line end
}

const KEY_MAP: [RegExp, HeaderKey][] = [
  [/^(document type|report type|note type|record type)$/i, "documentType"],
  [/^(facility|institution|clinic|hospital|laboratory|lab|pharmacy|organization)$/i, "facility"],
  [/^(provider|physician|clinician|author|attending|ordering provider|reading physician|prescriber|pharmacist)$/i, "provider"],
  [/^(date of service|visit date|report date|date|encounter date|note date|date reported|list date|date printed)$/i, "recordDate"],
  [/^(patient|patient name|name)$/i, "patientName"],
  [/^(dob|date of birth|birth date)$/i, "dob"],
  [/^(sex|gender|sex assigned at birth)$/i, "sex"],
  [/^(admission date|admit date|date of admission|admitted)$/i, "admissionDate"],
  [/^(discharge date|date of discharge|discharged)$/i, "dischargeDate"],
  [/^(collection date|collected|specimen collected|date collected)$/i, "collectionDate"],
];

/** Header is the run of lines before the first blank-line-separated section. */
export function parseHeader(text: string): HeaderField[] {
  const fields: HeaderField[] = [];
  let offset = 0;
  const lines = text.split("\n");
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i];
    const start = offset;
    offset += line.length + 1;
    const clean = line.replace(/^\s*#\s?/, "").replace(/\r$/, "");
    const m = clean.match(/^\s*([A-Za-z][A-Za-z /]{1,40}?)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    // CSV rows have commas in the "key" side only rarely; skip lines that look like data rows.
    if (/,/.test(m[1])) continue;
    const mapped = KEY_MAP.find(([re]) => re.test(m[1].trim()));
    if (!mapped) continue;
    if (fields.some((f) => f.key === mapped[1])) continue; // first occurrence wins
    fields.push({ key: mapped[1], rawKey: m[1].trim(), value: m[2].trim(), start, end: start + line.replace(/\r$/, "").length });
  }
  return fields;
}

export function classifyDocumentType(label: string, body: string): DocumentType {
  const s = `${label}`.toLowerCase();
  const tests: [RegExp, DocumentType][] = [
    [/discharge/, "Discharge summary"],
    [/medication list|pharmacy|med list|medication reconciliation/, "Medication list"],
    [/lab|laboratory|pathology/, "Lab report"],
    [/imaging|radiology|echocardiogram|x-ray|xray|\bct\b|mri|ultrasound/, "Imaging report"],
    [/procedure|operative/, "Procedure note"],
    [/cardiology|endocrinology|nephrology|consult|specialist|neurology|pulmonology/, "Specialist note"],
    [/primary care|family medicine|internal medicine|office visit|annual|follow-up|follow up|wellness/, "Primary care note"],
  ];
  for (const [re, t] of tests) if (re.test(s)) return t;
  const b = body.slice(0, 3000).toLowerCase();
  for (const [re, t] of tests) if (re.test(b)) return t;
  return "Other";
}

export function buildMeta(text: string, fileName: string): DocumentMeta {
  const fields = parseHeader(text);
  const get = (k: HeaderKey) => fields.find((f) => f.key === k)?.value;
  const typeLabel = get("documentType") ?? fileName.replace(/\.[a-z0-9]+$/i, "");
  return {
    documentType: classifyDocumentType(typeLabel, text),
    documentTypeLabel: typeLabel,
    provider: get("provider") ?? "Unknown provider",
    facility: get("facility") ?? "Unknown facility",
    recordDate: parseDate(get("recordDate")) ?? parseDate(get("dischargeDate")) ?? parseDate(get("collectionDate")) ?? null,
    patientName: get("patientName"),
    dob: parseDate(get("dob")) ?? undefined,
    sex: get("sex"),
    admissionDate: parseDate(get("admissionDate")) ?? undefined,
    dischargeDate: parseDate(get("dischargeDate")) ?? undefined,
    collectionDate: parseDate(get("collectionDate")) ?? undefined,
  };
}

export const SYNTHETIC_MARKER = /synthetic/i;
