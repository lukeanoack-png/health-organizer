/**
 * Stage 1 — ingestion: bytes in, plain text out. Runs entirely in the browser (and in
 * Node for tests). Nothing is uploaded to a server and nothing is persisted.
 *
 * The RawDocument this produces is kept separately from anything extracted from it.
 */
import type { PageSpan, RawDocument } from "../types";
import { hash } from "../normalize/values";
import { buildMeta, SYNTHETIC_MARKER } from "./header";

export const ACCEPTED_EXTENSIONS = [".txt", ".csv", ".docx", ".pdf", ".md"];

export function formatOf(fileName: string): RawDocument["format"] | null {
  const ext = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (ext === ".txt" || ext === ".md") return "txt";
  if (ext === ".csv") return "csv";
  if (ext === ".docx") return "docx";
  if (ext === ".pdf") return "pdf";
  return null;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

// ---------- DOCX: a .docx is a zip; read word/document.xml with the platform inflater ----------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipEntry(zip: Uint8Array, wanted: string): Promise<Uint8Array | null> {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid DOCX (zip directory not found).");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      const lNameLen = dv.getUint16(localOffset + 26, true);
      const lExtraLen = dv.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const raw = zip.subarray(start, start + compSize);
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new Error(`Unsupported zip compression method ${method}.`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function decodeXmlEntities(s: string) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, "&");
}

export function docxXmlToText(xml: string): string {
  const body = xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeXmlEntities(body)
    .split("\n")
    .map((l) => l.replace(/\s*\|\s*$/, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readDocx(bytes: Uint8Array): Promise<string> {
  const xml = await readZipEntry(bytes, "word/document.xml");
  if (!xml) throw new Error("DOCX has no word/document.xml.");
  return docxXmlToText(new TextDecoder().decode(xml));
}

// ---------- PDF: unpdf (serverless pdf.js build), loaded only when a PDF arrives ----------

async function readPdf(bytes: Uint8Array): Promise<{ text: string; pages: PageSpan[] }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages: PageSpan[] = [];
  let out = "";
  (text as string[]).forEach((pageText, i) => {
    const clean = pageText.replace(/\r\n?/g, "\n").trim();
    if (out) out += "\n\n";
    const start = out.length;
    out += clean;
    pages.push({ page: i + 1, start, end: out.length });
  });
  return { text: out, pages };
}

// ---------- entry point ----------

export async function ingestFile(
  fileName: string,
  bytes: Uint8Array,
  origin: RawDocument["origin"],
): Promise<RawDocument> {
  const format = formatOf(fileName);
  if (!format) throw new Error(`Unsupported file type: ${fileName}. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
  const notes: string[] = [];
  let text = "";
  let pages: PageSpan[] | undefined;
  if (format === "txt" || format === "csv") text = decode(bytes);
  else if (format === "docx") text = await readDocx(bytes);
  else {
    const r = await readPdf(bytes);
    text = r.text;
    pages = r.pages;
    if (text.replace(/\s/g, "").length < 40) notes.push("Very little text found — this PDF may be a scan. Scanned images are not read in this prototype.");
  }
  const syntheticMarker = SYNTHETIC_MARKER.test(text) || SYNTHETIC_MARKER.test(fileName);
  if (!syntheticMarker) notes.push("No SYNTHETIC marker found in this file. This prototype is for synthetic records only.");
  const meta = buildMeta(text, fileName);
  if (!meta.recordDate) notes.push("No record date found in the header; facts from this file may be undated.");
  return {
    id: `doc_${hash(fileName + "\u0000" + text)}`,
    fileName,
    format,
    origin,
    text,
    pages,
    meta,
    syntheticMarker,
    ingestNotes: notes,
  };
}
