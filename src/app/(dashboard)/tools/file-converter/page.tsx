"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  Upload, CheckCircle2, XCircle, Download, FileText, FileSpreadsheet, FileCode2, Trash2,
  ChevronRight, ChevronDown, AlertTriangle, PackagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ManufacturedItemStatus, CreateManufacturedItemInput, IssueDefinition } from "@/lib/types/database";
import { useIssueDefinitions } from "@/hooks/use-issue-definitions";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PLRow {
  partNumber: string; size: string;
  volumePerBox: number; weightPerBox: number;
  boxes: number; qtyPerBox: number; qtyTotal: number;
  label: string; boxStart: number; boxEnd: number;
  lotNum: string; totalBoxes: number;
}
interface PLSummary { totalBoxes: number; totalParts: number; totalVolume: number; totalWeight: number }
interface PLData { summary: PLSummary; rows: PLRow[] }
interface CheckItem { label: string; passed: boolean; detail: string }
type ParsedItem = CreateManufacturedItemInput;
interface PartSummary { added: number; bad: number; manual: number }

// ─── Log system ───────────────────────────────────────────────────────────────

type LogLevel = "info" | "warn" | "error" | "success";
interface LogEntry { tag: string; message: string; level: LogLevel; ts: number }
type LogFn = (tag: string, message: string, level?: LogLevel) => void;

// ─── GBX File format ──────────────────────────────────────────────────────────

export interface GBXLotFile {
  gbx_version: "1";
  lot_number: string;
  converted_at: string;
  packing_list: {
    rows: Array<{
      part_number: string; size: string;
      volume_per_box: number; weight_per_box: number;
      boxes: number; qty_per_box: number; qty_total: number;
      box_label: string; box_start: number; box_end: number;
      lot_num: string; total_boxes: number;
    }>;
    summary: { total_boxes: number; total_parts: number; total_volume: number; total_weight: number };
  } | null;
  items: Array<{
    part_number: string; serial_number: string; lot_number: string;
    status: string; box_label: string | null; issue: string | null;
  }>;
}

// ─── Improved DOCX Parser ─────────────────────────────────────────────────────

async function parseDocxPL(buffer: ArrayBuffer, log: LogFn): Promise<PLData> {
  const zip = await JSZip.loadAsync(buffer);

  const docEntry = zip.file("word/document.xml") ?? zip.file("Word/document.xml");
  if (!docEntry) throw new Error("Invalid DOCX file: word/document.xml not found");

  log("DOCX", "Loaded ZIP, reading document.xml");
  const xmlStr = await docEntry.async("string");
  const xml = new DOMParser().parseFromString(xmlStr, "text/xml");

  // Join paragraphs within a cell with space — fixes multi-line content (e.g. "LOT#2 43/46 to\n45/46")
  const cellText = (tc: Element): string =>
    Array.from(tc.querySelectorAll("p"))
      .map(p => Array.from(p.querySelectorAll("t")).map(t => t.textContent ?? "").join(""))
      .filter(Boolean).join(" ").trim();

  // Find the main data table (one with "P/N" in first row)
  const tables = Array.from(xml.querySelectorAll("tbl"));
  log("DOCX", `Found ${tables.length} table(s) in document`);
  let mainTable: Element | null = null;

  for (let ti = 0; ti < tables.length; ti++) {
    const firstRow = tables[ti].querySelector("tr");
    if (!firstRow) continue;
    const headers = Array.from(firstRow.querySelectorAll("tc")).map(tc => cellText(tc));
    if (headers.some(h => /p\/n|part.?num/i.test(h))) {
      mainTable = tables[ti];
      log("DOCX", `Main table found at index ${ti} (header: ${headers.slice(0, 4).join(" | ")})`);
      break;
    }
  }
  if (!mainTable && tables.length > 0) {
    mainTable = tables.reduce<Element>((best, t) =>
      t.querySelectorAll("tr").length > best.querySelectorAll("tr").length ? t : best
    , tables[0]);
    log("DOCX", `No P/N table found — using largest table as fallback`, "warn");
  }

  // Summary from all paragraph text
  const allText = Array.from(xml.querySelectorAll("p"))
    .map(p => Array.from(p.querySelectorAll("t")).map(t => t.textContent ?? "").join(""))
    .filter(Boolean);

  const summary: PLSummary = { totalBoxes: 0, totalParts: 0, totalVolume: 0, totalWeight: 0 };
  for (const line of allText) {
    const num = (re: RegExp) => { const m = line.match(re); return m ? parseFloat(m[1].replace(/,/g, "")) : null; };
    if (/total\s+master\s+boxes/i.test(line)) summary.totalBoxes = num(/([\d,]+)/) ?? 0;
    else if (/total\s+(?:parts?|pcs|pieces?)/i.test(line)) summary.totalParts = num(/([\d,]+)/) ?? 0;
    else if (/total\s+volume/i.test(line)) summary.totalVolume = num(/([\d.]+)/) ?? 0;
    else if (/total\s+weight/i.test(line)) summary.totalWeight = num(/([\d.]+)/) ?? 0;
  }
  log("DOCX", `Summary — Boxes: ${summary.totalBoxes}, Parts: ${summary.totalParts}, Vol: ${summary.totalVolume} m³, Wt: ${summary.totalWeight} kg`);

  const rows: PLRow[] = [];
  if (mainTable) {
    const tableRows = Array.from(mainTable.querySelectorAll("tr"));
    let hdrIdx = 0;
    for (let i = 0; i < Math.min(tableRows.length, 4); i++) {
      const cells = Array.from(tableRows[i].querySelectorAll("tc")).map(cellText);
      if (cells.some(c => /p\/n/i.test(c))) { hdrIdx = i; break; }
    }
    log("DOCX", `Header row at index ${hdrIdx}, scanning ${tableRows.length - hdrIdx - 1} data rows`);

    for (let ri = hdrIdx + 1; ri < tableRows.length; ri++) {
      const cells = Array.from(tableRows[ri].querySelectorAll("tc")).map(cellText);
      if (cells.length < 7) continue;
      const pn = cells[0].trim();
      if (!pn || !/[-_]/.test(pn)) continue;
      const n = (s: string) => parseFloat(s.replace(/[^\d.]/g, "")) || 0;
      const rawLabel = cells[7] ?? "";
      const bm = rawLabel.match(/LOT#?\s*(\d+)\s+(\d+)\/(\d+)(?:\s+to\s+(\d+)\/\d+)?/i);
      rows.push({
        partNumber: pn, size: cells[1],
        volumePerBox: n(cells[2]), weightPerBox: n(cells[3]),
        boxes: n(cells[4]), qtyPerBox: n(cells[5]), qtyTotal: n(cells[6]),
        label: rawLabel,
        lotNum: bm ? bm[1] : "", boxStart: bm ? parseInt(bm[2]) : 0,
        totalBoxes: bm ? parseInt(bm[3]) : 0, boxEnd: bm ? parseInt(bm[4] ?? bm[2]) : 0,
      });
      log("DOCX", `  ${pn}: ${n(cells[4])} boxes × ${n(cells[5])}/box = ${n(cells[6])} pcs  [${rawLabel || "no label"}]`);
    }
  }

  log("DOCX", `Parsed ${rows.length} product rows`, rows.length > 0 ? "success" : "warn");
  return { summary, rows };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function expandRange(rangeStr: string): string[] {
  if (!rangeStr.includes("-")) return [];
  const [startStr, rawEnd] = rangeStr.split("-");
  const s = parseInt(startStr, 10);
  if (isNaN(s)) return [];
  let endStr = rawEnd;
  if (rawEnd.length > startStr.length) {
    let fixed = "";
    for (let i = 0; i < rawEnd.length; i++) {
      const candidate = rawEnd.slice(0, i) + rawEnd.slice(i + 1);
      if (candidate.length !== startStr.length) continue;
      const c = parseInt(candidate, 10);
      if (!isNaN(c) && c >= s && c - s <= 9999) { fixed = candidate; break; }
    }
    endStr = fixed || rawEnd.slice(0, startStr.length);
  }
  const end = parseInt(endStr, 10);
  if (isNaN(end) || end < s || end - s > 9999) return [];
  const result: string[] = [];
  for (let sn = s; sn <= end; sn++) result.push(sn.toString());
  return result;
}

function matchIssue(comment: string, defs: IssueDefinition[]): string | null {
  const lower = comment.toLowerCase();
  for (const def of defs) {
    if (def.keywords.some(kw => kw.trim() && lower.includes(kw.trim().toLowerCase()))) return def.name;
  }
  return null;
}

function detectIsRange(rows: (string | number | null)[][], col: number, dataStart: number): boolean {
  let rangeCount = 0, total = 0;
  for (let r = dataStart; r < Math.min(dataStart + 15, rows.length); r++) {
    const v = rows[r][col];
    if (v == null || v === "") continue;
    total++;
    const s = v.toString().trim();
    if (s.includes("-") && /^\d/.test(s)) rangeCount++;
  }
  return total >= 1 && rangeCount / total > 0.4;
}

// Detects "quantity count" columns — small integer values (< 10000) with very few
// data rows. These are summed to produce sequential serial numbers (e.g. RCW1: 100+100=200).
function detectIsQuantity(rows: (string | number | null)[][], col: number, dataStart: number): boolean {
  let quantityCount = 0, total = 0;
  for (let r = dataStart; r < rows.length; r++) {
    const v = rows[r][col];
    if (v == null || v === "") continue;
    total++;
    const s = v.toString().trim();
    const n = parseFloat(s);
    if (!isNaN(n) && Number.isInteger(n) && n >= 1 && n < 10000 && !s.includes("-")) quantityCount++;
  }
  // Must be few rows (≤5), all values look like small-integer counts
  return total >= 1 && total <= 5 && quantityCount === total;
}

// ─── Improved Excel Parser ────────────────────────────────────────────────────

function parseExcelLot(
  buffer: ArrayBuffer,
  lotNumber: string,
  issueDefs: IssueDefinition[],
  knownPartNumbers: string[],
  log: LogFn,
): ParsedItem[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null });
  if (rows.length === 0) return [];

  log("EXCEL", `Sheet "${wb.SheetNames[0]}" — ${rows.length} total rows`);
  if (issueDefs.length === 0) {
    log("EXCEL", "No issue definitions loaded — adjacent comments will not be matched", "warn");
  } else {
    log("EXCEL", `Issue definitions: ${issueDefs.length} loaded (${issueDefs.map(d => d.name).join(", ")})`);
  }

  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i] as (string | number | null)[];
    const hasPartNumbers = [0, 2, 4, 6, 8, 10, 12].some(c => {
      const v = row[c];
      return typeof v === "string" && (v.includes("-") || v.includes("_"));
    });
    if (hasPartNumbers) { headerIdx = i; break; }
  }
  if (headerIdx > 0) log("EXCEL", `Skipped ${headerIdx} title row(s), header at row ${headerIdx + 1}`);
  const dataStart = headerIdx + 1;
  const header = rows[headerIdx] as (string | null)[];

  const componentCols: { col: number; partNumber: string; isRange: boolean; isQuantity: boolean }[] = [];
  const matchedCols = new Set<number>();

  if (knownPartNumbers.length > 0) {
    for (let c = 0; c < header.length; c++) {
      const h = header[c];
      if (!h || typeof h !== "string") continue;
      const matched = knownPartNumbers.find(pn => pn.trim().toUpperCase() === h.trim().toUpperCase());
      if (matched) {
        const isRange = detectIsRange(rows as (string | number | null)[][], c, dataStart);
        const isQuantity = !isRange && detectIsQuantity(rows as (string | number | null)[][], c, dataStart);
        componentCols.push({ col: c, partNumber: matched, isRange, isQuantity });
        matchedCols.add(c);
        const mode = isQuantity ? "QUANTITY" : isRange ? "RANGE" : "individual";
        log("EXCEL", `  Col ${String.fromCharCode(65 + c)}: "${matched}" [kit-def match, ${mode}]`);
      }
    }
    const unmatched = knownPartNumbers.filter(pn => !componentCols.some(c => c.partNumber === pn));
    if (unmatched.length > 0) log("EXCEL", `Kit-def parts not found in header: ${unmatched.join(", ")}`, "warn");
  }

  for (let c = 0; c < header.length; c += 2) {
    if (matchedCols.has(c)) continue;
    const h = header[c];
    if (!h || typeof h !== "string") continue;
    if (h.includes("-") || h.includes("_")) {
      const isRange = detectIsRange(rows as (string | number | null)[][], c, dataStart);
      const isQuantity = !isRange && detectIsQuantity(rows as (string | number | null)[][], c, dataStart);
      componentCols.push({ col: c, partNumber: h.trim(), isRange, isQuantity });
      matchedCols.add(c);
      const mode = isQuantity ? "QUANTITY" : isRange ? "RANGE" : "individual";
      log("EXCEL", `  Col ${String.fromCharCode(65 + c)}: "${h.trim()}" [heuristic scan, ${mode}]`);
    }
  }

  const dataColIndices = componentCols.map(c => c.col);
  let separatorRow = -1;
  for (let r = dataStart + 1; r < rows.length; r++) {
    const row = rows[r] as (string | number | null)[];
    if (dataColIndices.every(ci => row[ci] == null || row[ci] === "")) { separatorRow = r; break; }
  }
  if (separatorRow > 0) log("EXCEL", `Separator row at index ${separatorRow} (row ${separatorRow + 1}) — exception section follows`);
  else log("EXCEL", "No separator row found — processing all rows");
  const normalEnd = separatorRow > 0 ? separatorRow : rows.length;

  // Merged-cell comment map for issue detection
  const colComments = new Map<number, Map<number, string>>();
  const merges: XLSX.Range[] = ((ws as { '!merges'?: XLSX.Range[] })['!merges']) ?? [];
  for (const merge of merges) {
    if (merge.s.c % 2 !== 1) continue;
    const addr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const cell = ws[addr];
    if (!cell?.v || typeof cell.v !== "string") continue;
    if (!colComments.has(merge.s.c)) colComments.set(merge.s.c, new Map());
    const colMap = colComments.get(merge.s.c)!;
    for (let mr = merge.s.r; mr <= merge.e.r; mr++) colMap.set(mr, cell.v);
  }
  for (const key of Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k))) {
    const { r, c } = XLSX.utils.decode_cell(key);
    if (c % 2 !== 1) continue;
    const cell = ws[key];
    if (!cell?.v || typeof cell.v !== "string") continue;
    if (!colComments.has(c)) colComments.set(c, new Map());
    if (!colComments.get(c)!.has(r)) colComments.get(c)!.set(r, cell.v);
  }

  const items: ParsedItem[] = [];

  for (const comp of componentCols) {
    const colLetter = String.fromCharCode(65 + comp.col);
    if (comp.isQuantity) {
      // RCW-style: cells contain quantity counts (e.g. 100, 100) — sum them, generate sequential serials
      let totalQty = 0;
      const batches: number[] = [];
      for (let r = dataStart; r < rows.length; r++) {
        const val = (rows[r] as (string | number | null)[])[comp.col];
        if (val == null || val === "") continue;
        const n = typeof val === "number" ? val : parseInt(val.toString(), 10);
        if (!isNaN(n) && n > 0) { batches.push(n); totalQty += n; }
      }
      const pad = String(totalQty).length;
      for (let i = 1; i <= totalQty; i++) {
        items.push({ part_number: comp.partNumber, serial_number: String(i).padStart(pad, "0"), lot_number: lotNumber, status: "CREATED" });
      }
      log("EXCEL", `  ${colLetter} ${comp.partNumber}: quantity mode — ${batches.join("+")}=${totalQty} items (serials 1–${totalQty})`, "warn");
    } else if (comp.isRange) {
      let count = 0;
      for (let r = dataStart; r < normalEnd; r++) {
        const val = (rows[r] as (string | number | null)[])[comp.col];
        if (val == null || val === "") continue;
        const strVal = val.toString().trim();
        if (!strVal.includes("-")) continue;
        const expanded = expandRange(strVal);
        count += expanded.length;
        for (const sn of expanded) {
          items.push({ part_number: comp.partNumber, serial_number: sn, lot_number: lotNumber, status: "CREATED" });
        }
      }
      log("EXCEL", `  ${colLetter} ${comp.partNumber}: range → ${count} items`);
    } else {
      let seenBlank = false, created = 0, bad = 0, firstBlankRow = -1;
      let commentsFound = 0, issuesMatched = 0;
      for (let r = dataStart; r < rows.length; r++) {
        const val = (rows[r] as (string | number | null)[])[comp.col];
        const isEmpty = val == null || val === "";
        if (isEmpty) {
          if (!seenBlank) { seenBlank = true; firstBlankRow = r + 1; }
          continue;
        }
        const strVal = val.toString().trim();
        if (!(typeof val === "number" || /^\d+$/.test(strVal))) continue;
        const status: ManufacturedItemStatus = seenBlank ? "BAD" : "CREATED";
        const adjComment = colComments.get(comp.col + 1)?.get(r) ?? null;
        let issue: string | null = null;
        if (adjComment) {
          commentsFound++;
          issue = matchIssue(adjComment, issueDefs);
          if (issue) {
            issuesMatched++;
            log("EXCEL", `    SN ${strVal} — comment: "${adjComment}" → matched "${issue}"`, "warn");
          } else if (issueDefs.length > 0) {
            log("EXCEL", `    SN ${strVal} — comment: "${adjComment}" → no match`);
          }
        }
        items.push({ part_number: comp.partNumber, serial_number: strVal, lot_number: lotNumber, status, issue });
        if (status === "CREATED") created++; else bad++;
      }
      const blankInfo = firstBlankRow > 0 ? ` | blank at row ${firstBlankRow}` : "";
      const commentInfo = commentsFound > 0 ? ` | ${commentsFound} comments, ${issuesMatched} matched` : " | no adjacent comments";
      log("EXCEL", `  ${colLetter} ${comp.partNumber}: ${created} CREATED, ${bad} BAD${blankInfo}${commentInfo}`);
    }
  }

  const totals = items.reduce((acc, i) => { const s = i.status ?? "CREATED"; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const issueCount = items.filter(i => i.issue).length;
  const issuesSummary = issueCount > 0 ? ` | ${issueCount} items with issues` : " | 0 issues matched";
  log("EXCEL", `Done — ${Object.entries(totals).map(([s, n]) => `${n} ${s}`).join(", ")}${issuesSummary}`, "success");
  return items;
}

// ─── Improved CSV Parser ──────────────────────────────────────────────────────

function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(cell.trim()); cell = ""; }
      else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
      else if (ch !== '\r') { cell += ch; }
    }
  }
  if (cell.trim() || row.length > 0) { row.push(cell.trim()); rows.push(row); }
  return rows;
}

function detectIsRangeCSV(rows: string[][], col: number, dataStart: number): boolean {
  let rangeCount = 0, total = 0;
  for (let r = dataStart; r < Math.min(dataStart + 15, rows.length); r++) {
    const v = rows[r][col]?.trim();
    if (!v) continue; total++;
    if (v.includes("-") && /^\d/.test(v)) rangeCount++;
  }
  return total >= 1 && rangeCount / total > 0.4;
}

function parseCSVLot(csvText: string, lotNumber: string, log: LogFn): ParsedItem[] {
  const rows = parseCSVRows(csvText);
  if (rows.length < 2) return [];

  log("CSV", `${rows.length} total rows`);
  const headerRow = rows[0];
  interface ColDef { col: number; partNumber: string; isRange: boolean }
  const cols: ColDef[] = [];

  for (let c = 0; c < headerRow.length; c += 2) {
    const h = headerRow[c]?.trim();
    if (!h || !(h.includes("-") || h.includes("_"))) continue;
    const isRange = detectIsRangeCSV(rows, c, 1);
    cols.push({ col: c, partNumber: h, isRange });
    log("CSV", `  Col ${String.fromCharCode(65 + c)}: "${h}" [${isRange ? "RANGE" : "individual"}]`);
  }

  const dataColIndices = cols.map(c => c.col);
  let separatorRow = -1;
  for (let r = 2; r < rows.length; r++) {
    if (dataColIndices.every(ci => !rows[r][ci]?.trim())) { separatorRow = r; break; }
  }
  if (separatorRow > 0) log("CSV", `Separator row at ${separatorRow + 1}`);
  const normalEnd = separatorRow > 0 ? separatorRow : rows.length;

  const items: ParsedItem[] = [];

  for (const col of cols) {
    let created = 0, bad = 0, manual = 0;
    if (col.isRange) {
      for (let r = 1; r < normalEnd; r++) {
        const val = rows[r][col.col]?.trim();
        if (!val || !val.includes("-")) continue;
        for (const sn of expandRange(val)) {
          items.push({ part_number: col.partNumber, serial_number: sn, lot_number: lotNumber, status: "CREATED" });
          created++;
        }
      }
    } else {
      let seenBlank = false;
      for (let r = 1; r < rows.length; r++) {
        const val = rows[r][col.col]?.trim();
        if (!val) { seenBlank = true; continue; }
        if (!/^\d+(\.\d+)?$/.test(val)) continue;
        const sn = val.includes(".") ? val.split(".")[0] : val;
        const note = (rows[r][col.col + 1] ?? "").trim().toLowerCase();
        if (note === "missing") continue;
        const status: ManufacturedItemStatus = seenBlank
          ? "BAD"
          : note.includes("taken by you") ? "MANUAL" : note ? "BAD" : "CREATED";
        items.push({ part_number: col.partNumber, serial_number: sn, lot_number: lotNumber, status });
        if (status === "CREATED") created++; else if (status === "BAD") bad++; else manual++;
      }
    }
    log("CSV", `  ${col.partNumber}: ${created} CREATED, ${bad} BAD${manual > 0 ? `, ${manual} MANUAL` : ""}`);
  }

  // Exception section
  if (separatorRow > 0) {
    let excStart = separatorRow + 1;
    while (excStart < rows.length && rows[excStart].every(c => !c?.trim())) excStart++;
    let excCount = 0;
    for (let r = excStart; r < rows.length; r++) {
      const row = rows[r];
      if (row.every(c => !c?.trim())) continue;
      for (const col of cols) {
        const val = row[col.col]?.trim();
        if (!val || !/^\d/.test(val)) continue;
        const sn = val.includes(".") ? val.split(".")[0] : val;
        const note = (row[col.col + 1] ?? "").trim().toLowerCase();
        if (note === "missing") continue;
        const status: ManufacturedItemStatus = note.includes("taken by you") ? "MANUAL" : "BAD";
        if (col.isRange && sn.includes("-")) {
          for (const expanded of expandRange(sn)) { items.push({ part_number: col.partNumber, serial_number: expanded, lot_number: lotNumber, status }); excCount++; }
        } else { items.push({ part_number: col.partNumber, serial_number: sn, lot_number: lotNumber, status }); excCount++; }
      }
    }
    if (excCount > 0) log("CSV", `Exception section: ${excCount} additional items`, "warn");
  }

  const totals = items.reduce((acc, i) => { const s = i.status ?? "CREATED"; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  log("CSV", `Done — ${Object.entries(totals).map(([s, n]) => `${n} ${s}`).join(", ")}`, "success");
  return items;
}

// ─── Box label assignment ─────────────────────────────────────────────────────

const normPart = (s: string) => s.replace(/-/g, "_").toUpperCase();

function assignBoxLabels(items: ParsedItem[], plData: PLData | null, log: LogFn): ParsedItem[] {
  if (!plData || plData.rows.length === 0) return items;
  const plByPart = new Map<string, PLRow[]>();
  for (const row of plData.rows) {
    if (!row.boxStart || !row.lotNum) continue;
    const key = normPart(row.partNumber);
    if (!plByPart.has(key)) plByPart.set(key, []);
    plByPart.get(key)!.push(row);
  }
  const itemsByPart = new Map<string, ParsedItem[]>();
  for (const item of items) {
    const key = normPart(item.part_number);
    if (!itemsByPart.has(key)) itemsByPart.set(key, []);
    itemsByPart.get(key)!.push(item);
  }
  const result: ParsedItem[] = [];
  let labeled = 0;
  for (const [key, partItems] of itemsByPart) {
    const plRows = plByPart.get(key);
    if (!plRows) { result.push(...partItems); continue; }
    const sorted = [...partItems].sort((a, b) =>
      (parseInt(a.serial_number, 10) || 0) - (parseInt(b.serial_number, 10) || 0)
    );
    const sortedRows = [...plRows].sort((a, b) => a.boxStart - b.boxStart);
    let idx = 0;
    for (const row of sortedRows) {
      for (let box = row.boxStart; box <= row.boxEnd && idx < sorted.length; box++) {
        for (let q = 0; q < row.qtyPerBox && idx < sorted.length; q++, idx++) {
          sorted[idx] = { ...sorted[idx], box_label: `LOT#${row.lotNum} ${box}/${row.totalBoxes}` };
          labeled++;
        }
      }
    }
    result.push(...sorted);
  }
  log("BOX", `Assigned box labels to ${labeled} items`);
  return result;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function buildPLChecklist(pl: PLData): CheckItem[] {
  const checks: CheckItem[] = [];
  const tol = (a: number, b: number, t: number) => Math.abs(a - b) <= t;
  for (const row of pl.rows) {
    const calc = row.boxes * row.qtyPerBox;
    checks.push({ label: `${row.partNumber}: ${row.boxes}×${row.qtyPerBox}/box`, passed: calc === row.qtyTotal, detail: calc === row.qtyTotal ? `= ${row.qtyTotal} ✓` : `= ${calc}, stated ${row.qtyTotal}` });
  }
  const calcBoxes = pl.rows.reduce((s, r) => s + r.boxes, 0);
  const calcParts = pl.rows.reduce((s, r) => s + r.qtyTotal, 0);
  const calcVol   = pl.rows.reduce((s, r) => s + r.boxes * r.volumePerBox, 0);
  const calcWt    = pl.rows.reduce((s, r) => s + r.boxes * r.weightPerBox, 0);
  checks.push({ label: "Total Master Boxes", passed: calcBoxes === pl.summary.totalBoxes, detail: `${calcBoxes} vs ${pl.summary.totalBoxes} stated` });
  checks.push({ label: "Total Pcs",          passed: calcParts === pl.summary.totalParts,  detail: `${calcParts} vs ${pl.summary.totalParts} stated` });
  checks.push({ label: "Total Volume",        passed: tol(calcVol, pl.summary.totalVolume, 0.1), detail: `${calcVol.toFixed(3)} m³ vs ${pl.summary.totalVolume} m³` });
  checks.push({ label: "Total Weight",        passed: tol(calcWt,  pl.summary.totalWeight,  5),  detail: `${calcWt.toFixed(0)} kg vs ${pl.summary.totalWeight} kg` });
  return checks;
}

function buildCrossRefChecks(pl: PLData, parsedItems: ParsedItem[]): CheckItem[] {
  const countByPart: Record<string, number> = {};
  for (const item of parsedItems) {
    if (item.status !== "CREATED") continue;
    const key = normPart(item.part_number);
    countByPart[key] = (countByPart[key] ?? 0) + 1;
  }
  return pl.rows.map(row => {
    const actual = countByPart[normPart(row.partNumber)] ?? 0;
    return { label: row.partNumber, passed: actual === row.qtyTotal, detail: `Parsed: ${actual} | PL expected: ${row.qtyTotal}` };
  });
}

function buildImportSummary(items: ParsedItem[]): Record<string, PartSummary> {
  const byPart: Record<string, PartSummary> = {};
  for (const item of items) {
    if (!byPart[item.part_number]) byPart[item.part_number] = { added: 0, bad: 0, manual: 0 };
    if (item.status === "CREATED") byPart[item.part_number].added++;
    else if (item.status === "BAD") byPart[item.part_number].bad++;
    else if (item.status === "MANUAL") byPart[item.part_number].manual++;
  }
  return byPart;
}

// ─── GBX Download ────────────────────────────────────────────────────────────

function downloadGBXFile(lotNumber: string, plData: PLData | null, items: ParsedItem[]) {
  const gbx: GBXLotFile = {
    gbx_version: "1",
    lot_number: lotNumber,
    converted_at: new Date().toISOString(),
    packing_list: plData ? {
      rows: plData.rows.map(r => ({
        part_number: r.partNumber, size: r.size,
        volume_per_box: r.volumePerBox, weight_per_box: r.weightPerBox,
        boxes: r.boxes, qty_per_box: r.qtyPerBox, qty_total: r.qtyTotal,
        box_label: r.label, box_start: r.boxStart, box_end: r.boxEnd,
        lot_num: r.lotNum, total_boxes: r.totalBoxes,
      })),
      summary: { total_boxes: plData.summary.totalBoxes, total_parts: plData.summary.totalParts, total_volume: plData.summary.totalVolume, total_weight: plData.summary.totalWeight },
    } : null,
    items: items.map(i => ({
      part_number: i.part_number, serial_number: i.serial_number, lot_number: i.lot_number ?? lotNumber,
      status: i.status ?? "CREATED", box_label: i.box_label ?? null, issue: i.issue ?? null,
    })),
  };
  const blob = new Blob([JSON.stringify(gbx, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${lotNumber}_gbx.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function CheckIcon({ passed }: { passed: boolean }) {
  if (passed) return <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />;
  return <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />;
}

function fmt(n: number) { return n.toLocaleString(); }

const TAG_COLORS: Record<string, string> = {
  DOCX:  "text-blue-400",
  EXCEL: "text-amber-400",
  CSV:   "text-green-400",
  BOX:   "text-purple-400",
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  info:    "text-zinc-400",
  warn:    "text-amber-300",
  error:   "text-red-400",
  success: "text-green-400",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FileConverterPage() {
  const router = useRouter();
  const { data: issueDefinitions = [] } = useIssueDefinitions();
  const [lotNumber, setLotNumber] = useState("");

  // Packing list state
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [plData, setPlData] = useState<PLData | null>(null);
  const [plChecks, setPlChecks] = useState<CheckItem[] | null>(null);
  const [plError, setPlError] = useState("");
  const [docxDragging, setDocxDragging] = useState(false);
  const docxRef = useRef<HTMLInputElement>(null);

  // Serial numbers state
  const [snFile, setSnFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[] | null>(null);
  const [importSummary, setImportSummary] = useState<Record<string, PartSummary> | null>(null);
  const [crossRefChecks, setCrossRefChecks] = useState<CheckItem[] | null>(null);
  const [expandedIssueNodes, setExpandedIssueNodes] = useState<Set<string>>(new Set());
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());
  const [creatingLot, setCreatingLot] = useState(false);
  const [lotCreated, setLotCreated] = useState(false);
  const [snError, setSnError] = useState("");
  const [snDragging, setSnDragging] = useState(false);
  const snRef = useRef<HTMLInputElement>(null);

  // Log panel
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function addLog(tag: string, message: string, level: LogLevel = "info") {
    console.log(`[${tag}] ${message}`);
    setLogs(prev => [...prev, { tag, message, level, ts: Date.now() }]);
  }

  function clearLogs() { setLogs([]); }

  // Stored reference to plData for use in SN handler (needed because state update is async)
  const plDataRef = useRef<PLData | null>(null);

  async function handleDocxFile(file: File) {
    setDocxFile(file);
    setPlError(""); setPlChecks(null); setPlData(null);
    setParsedItems(null); setImportSummary(null); setCrossRefChecks(null);
    plDataRef.current = null;
    clearLogs();
    addLog("DOCX", `Processing: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    const reader = new FileReader();
    reader.onerror = () => { setPlError("Could not read the file."); addLog("DOCX", "File read error", "error"); };
    reader.onload = async (ev) => {
      try {
        const pl = await parseDocxPL(ev.target?.result as ArrayBuffer, addLog);
        if (pl.rows.length === 0) {
          const msg = "No product rows found — check the file has a valid packing list table with GBX P/N column.";
          setPlError(msg); addLog("DOCX", msg, "error"); return;
        }
        setPlData(pl);
        plDataRef.current = pl;
        setPlChecks(buildPLChecklist(pl));
        toast.success(`Packing list loaded — ${pl.rows.length} products`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setPlError(`Parse error: ${msg}`);
        addLog("DOCX", `Error: ${msg}`, "error");
        toast.error(`DOCX error: ${msg}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleSnFile(file: File) {
    setSnFile(file);
    setSnError(""); setParsedItems(null); setImportSummary(null); setCrossRefChecks(null);
    setResolvedKeys(new Set()); setLotCreated(false);
    const lot = lotNumber.trim();
    if (!lot) { setSnError("Enter a LOT # first."); return; }

    const isCSV = file.name.toLowerCase().endsWith(".csv");
    addLog(isCSV ? "CSV" : "EXCEL", `Processing: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    const reader = new FileReader();
    reader.onerror = () => { setSnError("Could not read the file."); addLog("EXCEL", "File read error", "error"); };

    if (isCSV) {
      reader.onload = (ev) => {
        try {
          const raw = parseCSVLot(ev.target?.result as string, lot, addLog);
          if (raw.length === 0) { setSnError("No valid items found."); return; }
          const currentPl = plDataRef.current;
          const parsed = assignBoxLabels(raw, currentPl, addLog);
          setParsedItems(parsed);
          setImportSummary(buildImportSummary(parsed));
          if (currentPl) setCrossRefChecks(buildCrossRefChecks(currentPl, parsed));
          toast.success(`${fmt(parsed.length)} items parsed`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setSnError(`Parse error: ${msg}`);
          addLog("CSV", `Error: ${msg}`, "error");
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = (ev) => {
        try {
          const raw = parseExcelLot(ev.target?.result as ArrayBuffer, lot, issueDefinitions, [], addLog);
          if (raw.length === 0) { setSnError("No valid items found."); return; }
          const currentPl = plDataRef.current;
          const parsed = assignBoxLabels(raw, currentPl, addLog);
          setParsedItems(parsed);
          setImportSummary(buildImportSummary(parsed));
          if (currentPl) setCrossRefChecks(buildCrossRefChecks(currentPl, parsed));
          toast.success(`${fmt(parsed.length)} items parsed`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setSnError(`Parse error: ${msg}`);
          addLog("EXCEL", `Error: ${msg}`, "error");
          toast.error(`Excel error: ${msg}`);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }

  function handleResolve(key: string) {
    setResolvedKeys(prev => new Set([...prev, key]));
  }

  async function handleCreateLot() {
    if (!parsedItems || !lotNumber.trim()) return;
    setCreatingLot(true);
    try {
      const supabase = createClient();
      const lot = lotNumber.trim();

      const createdCount = parsedItems.filter(i => i.status === "CREATED").length;

      // Check if lot already exists
      const { data: existing } = await supabase
        .from("lot_imports")
        .select("id")
        .eq("lot_number", lot)
        .maybeSingle();

      if (existing) {
        // Update item count on existing lot + upsert items
        const { error: updateError } = await supabase
          .from("lot_imports")
          .update({ item_count: createdCount })
          .eq("id", existing.id);
        if (updateError) throw updateError;
      } else {
        // Create new lot_imports entry
        const { error: lotError } = await supabase
          .from("lot_imports")
          .insert({ lot_number: lot, item_count: createdCount });
        if (lotError) throw lotError;
      }

      // Upsert all manufactured items
      const { error: itemsError } = await supabase
        .from("manufactured_items")
        .upsert(parsedItems.map(i => ({
          part_number: i.part_number,
          serial_number: i.serial_number,
          lot_number: i.lot_number,
          status: i.status,
          issue: i.issue ?? null,
        })), { onConflict: "part_number,serial_number" });
      if (itemsError) throw itemsError;

      setLotCreated(true);
      toast.success(`LOT "${lot}" created — ${parsedItems.length} items added to inventory`);
      setTimeout(() => router.push("/lots"), 1500);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreatingLot(false);
    }
  }

  const allPlPassed = plChecks?.every(c => c.passed) ?? false;
  const canDownload = parsedItems && parsedItems.length > 0 && lotNumber.trim();
  const summaryTotals = importSummary
    ? Object.values(importSummary).reduce((acc, v) => ({ added: acc.added + v.added, bad: acc.bad + v.bad, manual: acc.manual + v.manual }), { added: 0, bad: 0, manual: 0 })
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
          <span>Tools</span><span>/</span><span className="text-zinc-300">File Converter</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-100">File Converter</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Convert factory files to GBX format for reliable LOT import.</p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-5 items-start">

        {/* ── Left: Converter ── */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-5">

          {/* LOT # */}
          <div className="space-y-1.5">
            <Label className="text-zinc-300">LOT Number</Label>
            <Input
              placeholder="e.g. LOT2"
              value={lotNumber}
              onChange={e => setLotNumber(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono max-w-xs"
            />
          </div>

          <Separator className="bg-zinc-800" />

          {/* Step 1 — DOCX */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold bg-zinc-700 text-zinc-300 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">1</span>
              <Label className="text-zinc-300">Packing List <span className="text-zinc-500 font-normal">(.docx) — optional</span></Label>
              {allPlPassed && <CheckCircle2 className="h-4 w-4 text-green-400" />}
            </div>
            <div
              onClick={() => docxRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDocxDragging(true); }}
              onDragLeave={() => setDocxDragging(false)}
              onDrop={e => { e.preventDefault(); setDocxDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleDocxFile(f); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${docxDragging ? "border-purple-500 bg-purple-500/10" : "border-zinc-600 hover:border-zinc-400"}`}
            >
              <FileText className="h-4 w-4 text-zinc-400 flex-shrink-0" />
              <span className="text-sm text-zinc-400 truncate">
                {plChecks ? `${docxFile?.name} — ${plChecks.filter(c => c.passed).length}/${plChecks.length} checks passed` : docxDragging ? "Drop .docx here" : "Click or drag packing list (.docx)"}
              </span>
              <input ref={docxRef} type="file" accept=".docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleDocxFile(f); e.target.value = ""; }} />
            </div>
            {plError && <p className="text-red-400 text-xs">{plError}</p>}
            {plChecks && (
              <div className="bg-zinc-800/60 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">Packing List Validation</p>
                  {plChecks.every(c => c.passed)
                    ? <span className="text-green-400 text-sm font-bold uppercase tracking-widest">✓ PASSED</span>
                    : <span className="text-red-400 text-sm font-bold uppercase tracking-widest">✗ ERROR — {plChecks.filter(c => !c.passed).length} failed</span>
                  }
                </div>
                {plChecks.map((check, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckIcon passed={check.passed} />
                    <div className="flex-1 min-w-0">
                      <span className="text-zinc-300 text-xs font-mono">{check.label}</span>
                      <span className="text-zinc-500 text-xs ml-2">{check.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator className="bg-zinc-800" />

          {/* Step 2 — XLSX / CSV */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold bg-zinc-700 text-zinc-300 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">2</span>
              <Label className="text-zinc-300">Serial Numbers <span className="text-zinc-500 font-normal">(.xlsx or .csv)</span></Label>
              {parsedItems && !snError && <CheckCircle2 className="h-4 w-4 text-green-400" />}
            </div>
            <div
              onClick={() => lotNumber.trim() && snRef.current?.click()}
              onDragOver={e => { e.preventDefault(); if (lotNumber.trim()) setSnDragging(true); }}
              onDragLeave={() => setSnDragging(false)}
              onDrop={e => { e.preventDefault(); setSnDragging(false); if (!lotNumber.trim()) return; const f = e.dataTransfer.files?.[0]; if (f) handleSnFile(f); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed transition-colors ${
                !lotNumber.trim() ? "border-zinc-800 opacity-50 cursor-not-allowed"
                : snDragging ? "border-purple-500 bg-purple-500/10 cursor-pointer"
                : "border-zinc-600 hover:border-zinc-400 cursor-pointer"
              }`}
            >
              <FileSpreadsheet className="h-4 w-4 text-zinc-400 flex-shrink-0" />
              <span className="text-sm text-zinc-400 truncate">
                {parsedItems ? `${snFile?.name} — ${fmt(parsedItems.length)} items parsed` : snDragging ? "Drop here" : "Click or drag serial number file (.xlsx or .csv)"}
              </span>
              <input ref={snRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleSnFile(f); e.target.value = ""; }} />
            </div>
            {snError && <p className="text-red-400 text-xs">{snError}</p>}

            {importSummary && summaryTotals && (
              <div className="bg-zinc-800/60 rounded-lg p-3 space-y-1.5">
                <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Parsed Items</p>
                {Object.entries(importSummary).map(([part, counts]) => (
                  <div key={part} className="flex items-center gap-3">
                    <span className="text-zinc-300 text-xs font-mono flex-1 truncate">{part}</span>
                    <span className="text-teal-400 text-xs">{fmt(counts.added)} ok</span>
                    {counts.manual > 0 && <span className="text-purple-400 text-xs">{counts.manual} manual</span>}
                  </div>
                ))}
                <Separator className="bg-zinc-700 my-1" />
                <div className="flex gap-4 text-xs font-medium">
                  <span className="text-zinc-300">{fmt(summaryTotals.added)} Added</span>
                  {summaryTotals.manual > 0 && <span className="text-purple-400">{fmt(summaryTotals.manual)} Manual</span>}
                </div>
              </div>
            )}

            {crossRefChecks && (
              <div className="bg-zinc-800/60 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">Cross-Reference vs Packing List</p>
                  {crossRefChecks.every(c => c.passed)
                    ? <span className="text-green-400 text-sm font-bold uppercase tracking-widest">✓ PASSED</span>
                    : <span className="text-red-400 text-sm font-bold uppercase tracking-widest">✗ ERROR — {crossRefChecks.filter(c => !c.passed).length} failed</span>
                  }
                </div>
                {crossRefChecks.map((check, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckIcon passed={check.passed} />
                    <div className="flex-1 min-w-0">
                      <span className="text-zinc-300 text-xs font-mono truncate">{check.label}</span>
                      <span className="text-zinc-500 text-xs ml-2">{check.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Issues tree */}
            {parsedItems && (() => {
              // Build groups: key = issue name | "MANUAL" (BAD without an issue is excluded)
              type IssueGroup = { label: string; color: string; items: ParsedItem[] };
              const groups = new Map<string, IssueGroup>();
              for (const item of parsedItems) {
                const key = item.issue ?? (item.status === "MANUAL" ? "MANUAL" : null);
                if (!key) continue;
                if (!groups.has(key)) {
                  const color = item.issue ? "text-red-400" : "text-purple-400";
                  groups.set(key, { label: key, color, items: [] });
                }
                groups.get(key)!.items.push(item);
              }
              if (groups.size === 0) return null;

              const totalAffected = Array.from(groups.values()).reduce((s, g) => s + g.items.length, 0);
              const toggleNode = (id: string) => setExpandedIssueNodes(prev => {
                const next = new Set(prev);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              });

              return (
                <div className="bg-zinc-800/60 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">Issues Overview</p>
                    <span className="text-amber-400 text-xs font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />{totalAffected} items affected
                    </span>
                  </div>
                  <div className="space-y-1">
                    {Array.from(groups.entries()).map(([key, group]) => {
                      // Sub-group by part number
                      const byPart = new Map<string, ParsedItem[]>();
                      for (const item of group.items) {
                        if (!byPart.has(item.part_number)) byPart.set(item.part_number, []);
                        byPart.get(item.part_number)!.push(item);
                      }
                      const groupOpen = expandedIssueNodes.has(key);
                      const groupResolved = resolvedKeys.has(key);

                      return (
                        <div key={key}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleNode(key)}
                              className="flex items-center gap-1.5 flex-1 text-left hover:bg-zinc-700/40 rounded px-1 py-1 min-w-0"
                            >
                              {groupOpen ? <ChevronDown className="h-3 w-3 text-zinc-500 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-zinc-500 flex-shrink-0" />}
                              <span className={`text-xs font-semibold ${group.color}`}>{group.label}</span>
                              <span className="text-zinc-500 text-xs ml-1">({group.items.length})</span>
                            </button>
                            {groupResolved
                              ? <span className="text-green-400 text-[10px] font-semibold px-2 flex-shrink-0">✓ Reviewed</span>
                              : <button
                                  onClick={() => handleResolve(key)}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded border border-zinc-600 text-zinc-300 hover:border-[#16a34a] hover:text-[#16a34a] flex-shrink-0 transition-colors"
                                >
                                  Resolve All
                                </button>
                            }
                          </div>
                          {groupOpen && (
                            <div className="ml-4 mt-0.5 space-y-0.5">
                              {Array.from(byPart.entries()).map(([part, partItems]) => {
                                const partKey = `${key}|${part}`;
                                const partOpen = expandedIssueNodes.has(partKey);
                                const partResolved = resolvedKeys.has(partKey) || groupResolved;
                                return (
                                  <div key={partKey}>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => toggleNode(partKey)}
                                        className="flex items-center gap-1.5 flex-1 text-left hover:bg-zinc-700/40 rounded px-1 py-0.5 min-w-0"
                                      >
                                        {partOpen ? <ChevronDown className="h-3 w-3 text-zinc-600 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-zinc-600 flex-shrink-0" />}
                                        <span className="text-zinc-400 text-xs font-mono truncate">{part}</span>
                                        <span className="text-zinc-600 text-xs ml-1 flex-shrink-0">({partItems.length})</span>
                                      </button>
                                      {!groupResolved && (
                                        partResolved
                                          ? <span className="text-green-400 text-[10px] font-semibold px-2 flex-shrink-0">✓ Reviewed</span>
                                          : <button
                                              onClick={() => handleResolve(partKey)}
                                              className="text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 flex-shrink-0 transition-colors"
                                            >
                                              Resolve
                                            </button>
                                      )}
                                    </div>
                                    {partOpen && (
                                      <div className="ml-4 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 pb-1">
                                        {partItems.map(item => (
                                          <span key={item.serial_number} className={cn("text-[11px] font-mono", partResolved ? "text-zinc-600 line-through" : "text-zinc-400")}>
                                            {item.serial_number}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          <Separator className="bg-zinc-800" />

          {/* Actions */}
          <div className="space-y-3">
            <p className="text-zinc-500 text-xs">
              {canDownload
                ? <span className="text-zinc-300"><span className="text-teal-400 font-medium">{fmt(parsedItems!.length)} items</span>{plData ? `, ${plData.rows.length} PL products` : ""} ready</span>
                : "Upload a serial number file to continue."}
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => { if (!canDownload || !parsedItems) return; downloadGBXFile(lotNumber.trim(), plData, parsedItems); toast.success(`${lotNumber.trim()}_gbx.json downloaded`); }}
                disabled={!canDownload}
                variant="outline"
                className="flex-1 gap-2 border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                Export GBX
              </Button>
              <Button
                onClick={handleCreateLot}
                disabled={!canDownload || creatingLot || lotCreated}
                className="flex-1 gap-2 bg-[#16a34a] hover:bg-[#15803d] text-white disabled:opacity-40"
              >
                {lotCreated
                  ? <><CheckCircle2 className="h-4 w-4" /> LOT Created</>
                  : creatingLot
                  ? <><PackagePlus className="h-4 w-4 animate-pulse" /> Creating…</>
                  : <><PackagePlus className="h-4 w-4" /> Create LOT</>
                }
              </Button>
            </div>
          </div>
        </div>

        {/* ── Right: Parse Log ── */}
        <div className="sticky top-0 rounded-lg border border-zinc-800 bg-zinc-950 flex flex-col" style={{ height: "calc(100vh - 104px)", minHeight: "400px" }}>
          {/* Log header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Parse Log</span>
              {logs.length > 0 && (
                <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700 text-[10px] px-1.5 py-0 h-4">{logs.length}</Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Legend */}
              <div className="flex items-center gap-2 text-[10px]">
                {Object.entries(TAG_COLORS).map(([tag, color]) => (
                  <span key={tag} className={cn("font-mono font-medium", color)}>{tag}</span>
                ))}
              </div>
              <button onClick={clearLogs} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 px-2 py-1 rounded transition-colors">
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            </div>
          </div>

          {/* Log body */}
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-700">
                <FileCode2 className="h-8 w-8" />
                <p>Upload files to see parse output</p>
              </div>
            ) : (
              logs.map((entry, i) => (
                <div key={i} className="flex gap-2 leading-5">
                  <span className={cn("flex-shrink-0 font-semibold w-14", TAG_COLORS[entry.tag] ?? "text-zinc-500")}>
                    [{entry.tag}]
                  </span>
                  <span className={cn("break-all", LEVEL_COLORS[entry.level])}>
                    {entry.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>

      </div>

      {/* Info badges */}
      <div className="flex flex-wrap gap-2">
        {["Improved DOCX parser — correct table detection", "Multi-line cell joining (fixes LOT label splits)", "Dynamic range detection from data", "Box label assignment included"].map(f => (
          <Badge key={f} className="bg-zinc-800 text-zinc-500 border-zinc-700 text-[10px]">{f}</Badge>
        ))}
      </div>
    </div>
  );
}
