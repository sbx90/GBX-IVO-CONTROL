"use client";

import { useState, useRef, useMemo } from "react";
import {
  FileSpreadsheet, Upload, CheckCircle2, XCircle, Download, FileText, Trash2, AlertTriangle, FileCode2,
} from "lucide-react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useLotImports,
  useCreateLotImport,
  useUpdateLotImport,
  useDeleteLotImport,
  useBulkCreateManufacturedItems,
} from "@/hooks/use-manufactured";
import { useClients } from "@/hooks/use-clients";
import { useProductionOrders } from "@/hooks/use-production";
import { useIssueDefinitions } from "@/hooks/use-issue-definitions";
import { useKitDefinitions } from "@/hooks/use-kit-definitions";
import { formatDate } from "@/lib/utils";
import type { ManufacturedItemStatus, CreateManufacturedItemInput, LotImport, LotStatus, IssueDefinition } from "@/lib/types/database";
import type { GBXLotFile } from "@/app/(dashboard)/tools/file-converter/page";

// ─── PL (DOCX) types & parser ──────────────────────────────────────

interface PLRow {
  partNumber: string;
  size: string;
  volumePerBox: number;
  weightPerBox: number;
  boxes: number;
  qtyPerBox: number;
  qtyTotal: number;
  label: string;
  boxStart: number;
  boxEnd: number;
  lotNum: string;
  totalBoxes: number;
}

interface PLSummary {
  totalBoxes: number;
  totalParts: number;
  totalVolume: number;
  totalWeight: number;
}

interface PLData {
  summary: PLSummary;
  rows: PLRow[];
}

interface CheckItem {
  label: string;
  passed: boolean;
  detail: string;
}

async function parseDocxPL(buffer: ArrayBuffer): Promise<PLData> {
  const zip = await JSZip.loadAsync(buffer);

  // Handle both lower and upper-case path (cross-platform DOCX variations)
  const docEntry = zip.file("word/document.xml") ?? zip.file("Word/document.xml");
  if (!docEntry) throw new Error("Invalid DOCX file: word/document.xml not found");

  const xmlStr = await docEntry.async("string");
  const xml = new DOMParser().parseFromString(xmlStr, "text/xml");

  // Join paragraphs within a cell with space — fixes multi-line content like "LOT#2 43/46 to\n45/46"
  const cellText = (tc: Element): string =>
    Array.from(tc.querySelectorAll("p"))
      .map(p => Array.from(p.querySelectorAll("t")).map(t => t.textContent ?? "").join(""))
      .filter(Boolean)
      .join(" ")
      .trim();

  // Find the main data table: the one with "P/N" in its header row
  const tables = Array.from(xml.querySelectorAll("tbl"));
  let mainTable: Element | null = null;
  for (const tbl of tables) {
    const firstRow = tbl.querySelector("tr");
    if (!firstRow) continue;
    const headers = Array.from(firstRow.querySelectorAll("tc")).map(tc => cellText(tc));
    if (headers.some(h => /p\/n|part.?num/i.test(h))) { mainTable = tbl; break; }
  }
  // Fallback: largest table
  if (!mainTable && tables.length > 0) {
    mainTable = tables.reduce<Element>((best, t) =>
      t.querySelectorAll("tr").length > best.querySelectorAll("tr").length ? t : best
    , tables[0]);
  }

  const allText = Array.from(xml.querySelectorAll("p"))
    .map((p) => Array.from(p.querySelectorAll("t")).map((t) => t.textContent ?? "").join(""))
    .filter(Boolean);

  const summary: PLSummary = { totalBoxes: 0, totalParts: 0, totalVolume: 0, totalWeight: 0 };
  for (const line of allText) {
    const numMatch = (pattern: RegExp) => {
      const m = line.match(pattern);
      return m ? parseFloat(m[1].replace(/,/g, "")) : null;
    };
    if (/Total Master Boxes/i.test(line)) summary.totalBoxes = numMatch(/([\d,]+)/) ?? 0;
    else if (/Total\s+(?:parts?|pcs|pieces?|qty|quantities?)/i.test(line)) summary.totalParts = numMatch(/([\d,]+)/) ?? 0;
    else if (/Total Volume/i.test(line)) summary.totalVolume = numMatch(/([\d.]+)\s*m/) ?? 0;
    else if (/Total Weight/i.test(line)) summary.totalWeight = numMatch(/([\d.]+)\s*kg/) ?? 0;
  }

  const rows: PLRow[] = [];
  if (mainTable) {
    const tableRows = Array.from(mainTable.querySelectorAll("tr"));
    // Detect header row dynamically
    let hdrIdx = 0;
    for (let i = 0; i < Math.min(tableRows.length, 4); i++) {
      const cells = Array.from(tableRows[i].querySelectorAll("tc")).map(cellText);
      if (cells.some(c => /p\/n/i.test(c))) { hdrIdx = i; break; }
    }
    for (let ri = hdrIdx + 1; ri < tableRows.length; ri++) {
      const cells = Array.from(tableRows[ri].querySelectorAll("tc")).map(cellText);
      if (cells.length < 7) continue;
      const pn = cells[0].trim();
      // Skip rows without a valid part number (no dash or underscore = not a P/N)
      if (!pn || !/[-_]/.test(pn)) continue;
      const n = (s: string) => parseFloat(s.replace(/[^\d.]/g, "")) || 0;
      const rawLabel = cells[7] ?? "";
      const bm = rawLabel.match(/LOT#?\s*(\d+)\s+(\d+)\/(\d+)(?:\s+to\s+(\d+)\/\d+)?/i);
      rows.push({
        partNumber: pn, size: cells[1], volumePerBox: n(cells[2]), weightPerBox: n(cells[3]),
        boxes: n(cells[4]), qtyPerBox: n(cells[5]), qtyTotal: n(cells[6]),
        label: rawLabel,
        lotNum:     bm ? bm[1] : "",
        boxStart:   bm ? parseInt(bm[2]) : 0,
        totalBoxes: bm ? parseInt(bm[3]) : 0,
        boxEnd:     bm ? parseInt(bm[4] ?? bm[2]) : 0,
      });
    }
  }
  return { summary, rows };
}

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
  checks.push({ label: "Total Pcs", passed: calcParts === pl.summary.totalParts, detail: `${calcParts} vs ${pl.summary.totalParts} stated` });
  checks.push({ label: "Total Volume",       passed: tol(calcVol, pl.summary.totalVolume, 0.1), detail: `${calcVol.toFixed(3)} m³ vs ${pl.summary.totalVolume} m³ stated` });
  checks.push({ label: "Total Weight",       passed: tol(calcWt,  pl.summary.totalWeight,  5),  detail: `${calcWt.toFixed(0)} kg vs ${pl.summary.totalWeight} kg stated` });
  return checks;
}

// ─── CSV parser ────────────────────────────────────────────────────

type ParsedItem = CreateManufacturedItemInput;

function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

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

function parseCSVLot(csvText: string, lotNumber: string): ParsedItem[] {
  const rows = parseCSVRows(csvText);
  if (rows.length < 2) return [];

  console.log(`[LOT PARSER] Total CSV rows (incl. header): ${rows.length}`);

  const headerRow = rows[0];
  interface ColDef { col: number; partNumber: string; type: "individual" | "range" | "skip" }
  const cols: ColDef[] = [];
  for (let c = 0; c < headerRow.length; c += 2) {
    const h = headerRow[c]?.trim();
    if (!h) continue;
    const type: ColDef["type"] = (c === 12) ? "skip" : (c === 8 || c === 10) ? "range" : "individual";
    cols.push({ col: c, partNumber: h, type });
  }

  const colLetters = (i: number) => String.fromCharCode(65 + i);
  console.log(`[LOT PARSER] Detected columns:`, cols.map(c => `${colLetters(c.col)}=${c.partNumber}(${c.type})`).join(", "));

  const dataColIndices = cols.filter(c => c.type !== "skip").map(c => c.col);
  let separatorRow = -1;
  for (let r = 2; r < rows.length; r++) {
    if (dataColIndices.every(ci => !rows[r][ci]?.trim())) {
      separatorRow = r;
      break;
    }
  }
  const normalEnd = separatorRow > 0 ? separatorRow : rows.length;

  console.log(`[LOT PARSER] Separator row: ${separatorRow === -1 ? "NOT FOUND" : `row ${separatorRow} (CSV row ${separatorRow + 1})`}`);

  const items: ParsedItem[] = [];

  for (const col of cols) {
    if (col.type === "skip") continue;

    if (col.type === "individual") {
      let stopRow = -1;
      const statusCounts: Record<string, number> = { ADDED: 0, BAD: 0, MANUAL: 0, SKIP: 0 };
      for (let r = 1; r < rows.length; r++) {
        const val = rows[r][col.col]?.trim();
        if (!val) { stopRow = r; break; }
        if (!/^\d+(\.\d+)?$/.test(val)) continue;
        const sn = val.includes(".") ? val.split(".")[0] : val;
        const note = (rows[r][col.col + 1] ?? "").trim().toLowerCase();
        if (note === "missing") { statusCounts.SKIP++; continue; }
        const status: ManufacturedItemStatus = note.includes("taken by you") ? "MANUAL" : note ? "BAD" : "CREATED";
        statusCounts[status]++;
        items.push({ part_number: col.partNumber, serial_number: sn, lot_number: lotNumber, status });
      }
      console.log(
        `[LOT PARSER] ${colLetters(col.col)} (${col.partNumber}): ` +
        `started row 2, stopped at ${stopRow === -1 ? "end of file" : `row ${stopRow + 1} (blank)`} — ` +
        `ADDED=${statusCounts.ADDED} BAD=${statusCounts.BAD} MANUAL=${statusCounts.MANUAL} SKIP=${statusCounts.SKIP}`
      );
    } else {
      let rangeCount = 0;
      const rawRanges: string[] = [];
      for (let r = 1; r < normalEnd; r++) {
        const val = rows[r][col.col]?.trim();
        if (!val) continue;
        if (!val.includes("-")) continue;
        rawRanges.push(val);
        const expanded = expandRange(val);
        rangeCount += expanded.length;
        for (const sn of expanded) {
          items.push({ part_number: col.partNumber, serial_number: sn, lot_number: lotNumber, status: "CREATED" });
        }
      }
      console.log(
        `[LOT PARSER] ${colLetters(col.col)} (${col.partNumber}): ` +
        `range column, scanned rows 2–${normalEnd + 1} — ` +
        `ranges found: [${rawRanges.join(", ")}] → ADDED=${rangeCount}`
      );
    }
  }

  if (separatorRow > 0) {
    let excStart = separatorRow + 1;
    while (excStart < rows.length && rows[excStart].every(c => !c?.trim())) excStart++;

    const excCounts: Record<string, number> = {};
    for (let r = excStart; r < rows.length; r++) {
      const row = rows[r];
      if (row.every(c => !c?.trim())) continue;
      for (const col of cols) {
        if (col.type === "skip") continue;
        const val = row[col.col]?.trim();
        if (!val) continue;
        if (!/^\d/.test(val)) continue;
        const sn = val.includes(".") ? val.split(".")[0] : val;
        const note = (row[col.col + 1] ?? "").trim().toLowerCase();
        if (note === "missing") continue;
        const status: ManufacturedItemStatus = note.includes("taken by you") ? "MANUAL" : "BAD";
        const key = `${col.partNumber}:${status}`;
        excCounts[key] = (excCounts[key] ?? 0) + 1;
        if (col.type === "range" && sn.includes("-")) {
          for (const expandedSn of expandRange(sn)) {
            items.push({ part_number: col.partNumber, serial_number: expandedSn, lot_number: lotNumber, status });
          }
        } else {
          items.push({ part_number: col.partNumber, serial_number: sn, lot_number: lotNumber, status });
        }
      }
    }
    if (Object.keys(excCounts).length > 0) {
      console.log(`[LOT PARSER] Exception section items:`, excCounts);
    }
  }

  const totalByStatus = items.reduce((acc, i) => { const s = i.status ?? "CREATED"; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  console.log(`[LOT PARSER] FINAL TOTALS:`, totalByStatus);

  return items;
}

// ─── Excel parser (XLSX) ───────────────────────────────────────────

function matchIssue(comment: string, defs: IssueDefinition[]): string | null {
  const lower = comment.toLowerCase();
  for (const def of defs) {
    if (def.keywords.some(kw => kw.trim() && lower.includes(kw.trim().toLowerCase()))) return def.name;
  }
  return null;
}

function parseExcelLot(buffer: ArrayBuffer, lotNumber: string, issueDefs: IssueDefinition[] = [], knownPartNumbers: string[] = []): ParsedItem[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 });
  if (rows.length === 0) return [];

  console.log(`[EXCEL PARSER] Total rows (incl. header): ${rows.length}`);

  // Auto-detect header row: skip title rows (e.g. "LOT 2"), find first row
  // where even-column cells look like part numbers (contain "-" or "_")
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i] as (string | number | null)[];
    const hasPartNumbers = [0, 2, 4, 6, 8, 10].some(c => {
      const v = row[c];
      return typeof v === "string" && (v.includes("-") || v.includes("_"));
    });
    if (hasPartNumbers) { headerIdx = i; break; }
  }
  if (headerIdx > 0) console.log(`[EXCEL PARSER] Skipped ${headerIdx} title row(s), header at row ${headerIdx + 1}`);
  const dataStart = headerIdx + 1;

  const header = rows[headerIdx] as (string | null)[];
  const componentCols: { col: number; partNumber: string; isRange: boolean }[] = [];

  const matchedCols = new Set<number>();

  if (knownPartNumbers.length > 0) {
    // Primary: find columns by exact match to known part numbers (any column position)
    for (let c = 0; c < header.length; c++) {
      const h = header[c];
      if (!h || typeof h !== "string") continue;
      const matched = knownPartNumbers.find(pn => pn.trim().toUpperCase() === h.trim().toUpperCase());
      if (matched) {
        componentCols.push({ col: c, partNumber: matched, isRange: matched.toUpperCase().includes("PS") || matched.toUpperCase().includes("CDL") });
        matchedCols.add(c);
      }
    }
    const unmatched = knownPartNumbers.filter(pn => !componentCols.some(c => c.partNumber === pn));
    if (unmatched.length > 0) console.warn(`[EXCEL PARSER] Part numbers from kit def not found in Excel:`, unmatched);
  }

  // Always also scan even columns for part-number-like headers not already matched above
  // This catches components that aren't in the kit definition (e.g. RCW1 added later)
  for (let c = 0; c < header.length; c += 2) {
    if (matchedCols.has(c)) continue;
    const h = header[c];
    if (!h || typeof h !== "string") continue;
    if (h.includes("-") || h.includes("_")) {
      componentCols.push({ col: c, partNumber: h, isRange: h.toUpperCase().includes("PS") || h.toUpperCase().includes("CDL") });
      matchedCols.add(c);
    }
  }

  const colLetters = (i: number) => String.fromCharCode(65 + i);
  console.log(`[EXCEL PARSER] Detected columns:`, componentCols.map(c => `${colLetters(c.col)}=${c.partNumber}(${c.isRange ? "range" : "individual"})`).join(", "));

  const dataColIndices = componentCols.map(c => c.col);
  let separatorRow = -1;
  for (let r = dataStart + 1; r < rows.length; r++) {
    const row = rows[r] as (string | number | null)[];
    if (dataColIndices.every(ci => row[ci] == null || row[ci] === "")) {
      separatorRow = r;
      break;
    }
  }
  console.log(`[EXCEL PARSER] Separator row: ${separatorRow === -1 ? "NOT FOUND" : `index ${separatorRow} (file row ${separatorRow + 1})`}`);
  const normalEnd = separatorRow > 0 ? separatorRow : rows.length;

  const items: ParsedItem[] = [];

  // Build a map of row → comment text for each odd column (B=1, D=3, F=5, H=7…)
  // These adjacent columns contain factory comments (e.g. "Not sent", "Failed MB")
  const colComments = new Map<number, Map<number, string>>();
  // First pass: expand merged cell ranges
  const merges: XLSX.Range[] = ((ws as { '!merges'?: XLSX.Range[] })['!merges']) ?? [];
  for (const merge of merges) {
    if (merge.s.c % 2 !== 1) continue; // odd columns only
    const cellAddr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const cell = ws[cellAddr];
    if (!cell?.v || typeof cell.v !== 'string') continue;
    if (!colComments.has(merge.s.c)) colComments.set(merge.s.c, new Map());
    const colMap = colComments.get(merge.s.c)!;
    for (let mr = merge.s.r; mr <= merge.e.r; mr++) colMap.set(mr, cell.v);
  }
  // Second pass: catch non-merged text cells in odd columns
  for (const key of Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k))) {
    const { r, c } = XLSX.utils.decode_cell(key);
    if (c % 2 !== 1) continue;
    const cell = ws[key];
    if (!cell?.v || typeof cell.v !== 'string') continue;
    if (!colComments.has(c)) colComments.set(c, new Map());
    const colMap = colComments.get(c)!;
    if (!colMap.has(r)) colMap.set(r, cell.v); // don't overwrite merged values
  }

  for (const comp of componentCols) {
    if (comp.isRange) {
      const rawRanges: string[] = [];
      let rangeCount = 0;
      for (let r = dataStart; r < normalEnd; r++) {
        const row = rows[r] as (string | number | null)[];
        const val = row[comp.col];
        if (val == null || val === "") continue;
        const strVal = val.toString().trim();
        if (!strVal.includes("-")) continue;
        rawRanges.push(strVal);
        const expanded = expandRange(strVal);
        rangeCount += expanded.length;
        for (const sn of expanded) {
          items.push({ part_number: comp.partNumber, serial_number: sn, lot_number: lotNumber, status: "CREATED" });
        }
      }
      console.log(`[EXCEL PARSER] ${colLetters(comp.col)} (${comp.partNumber}): ranges [${rawRanges.join(", ")}] → ADDED=${rangeCount}`);
    } else {
      let seenBlank = false;
      const statusCounts = { CREATED: 0, BAD: 0 };
      let firstBlankRow = -1;
      let firstAddedRow = -1, lastAddedRow = -1;
      let firstBadRow = -1, lastBadRow = -1;
      for (let r = dataStart; r < rows.length; r++) {
        const row = rows[r] as (string | number | null)[];
        const val = row[comp.col];
        const isEmpty = val == null || val === "";
        if (isEmpty) {
          if (!seenBlank) { seenBlank = true; firstBlankRow = r; }
          continue;
        }
        const strVal = val.toString().trim();
        if (!(typeof val === "number" || /^\d+$/.test(strVal))) continue;
        const status: ManufacturedItemStatus = seenBlank ? "BAD" : "CREATED";
        statusCounts[status]++;
        const adjComment = colComments.get(comp.col + 1)?.get(r) ?? null;
        const issue = adjComment ? matchIssue(adjComment, issueDefs) : null;
        items.push({ part_number: comp.partNumber, serial_number: strVal, lot_number: lotNumber, status, issue });
        if (status === "CREATED") {
          if (firstAddedRow === -1) firstAddedRow = r;
          lastAddedRow = r;
        } else {
          if (firstBadRow === -1) firstBadRow = r;
          lastBadRow = r;
        }
      }
      const col = colLetters(comp.col);
      const addedRange = firstAddedRow !== -1 ? `${col}${firstAddedRow + 1}:${col}${lastAddedRow + 1}` : "—";
      const badRange = firstBadRow !== -1 ? `${col}${firstBadRow + 1}:${col}${lastBadRow + 1}` : "none";
      const blankAt = firstBlankRow !== -1 ? `${col}${firstBlankRow + 1}` : "never";
      console.log(
        `[EXCEL PARSER] ${col} (${comp.partNumber}): ` +
        `CREATED ${addedRange} (${statusCounts.CREATED} items) | ` +
        `first blank: ${blankAt} | ` +
        `BAD ${badRange} (${statusCounts.BAD} items)`
      );
    }
  }

  const totalByStatus = items.reduce((acc, i) => { const s = i.status ?? "CREATED"; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  console.log(`[EXCEL PARSER] FINAL TOTALS:`, totalByStatus);

  return items;
}

// ─── Box label assignment ───────────────────────────────────────────

const normPart = (s: string) => s.replace(/-/g, "_").toUpperCase();

function assignBoxLabels(items: ParsedItem[], plData: PLData | null): ParsedItem[] {
  if (!plData || plData.rows.length === 0) return items;

  // Group PLRows by normalized part number (multiple rows possible per part)
  const plByPart = new Map<string, PLRow[]>();
  for (const row of plData.rows) {
    if (!row.boxStart || !row.lotNum) continue;
    const key = normPart(row.partNumber);
    if (!plByPart.has(key)) plByPart.set(key, []);
    plByPart.get(key)!.push(row);
  }

  // Group items by normalized part number
  const itemsByPart = new Map<string, ParsedItem[]>();
  for (const item of items) {
    const key = normPart(item.part_number);
    if (!itemsByPart.has(key)) itemsByPart.set(key, []);
    itemsByPart.get(key)!.push(item);
  }

  const result: ParsedItem[] = [];
  for (const [key, partItems] of itemsByPart) {
    const plRows = plByPart.get(key);
    if (!plRows) { result.push(...partItems); continue; }

    // Sort items by serial number numerically, then assign boxes positionally
    const sorted = [...partItems].sort((a, b) =>
      (parseInt(a.serial_number, 10) || 0) - (parseInt(b.serial_number, 10) || 0)
    );
    // Sort PLRows by boxStart to handle split-box scenarios
    const sortedRows = [...plRows].sort((a, b) => a.boxStart - b.boxStart);

    let idx = 0;
    for (const row of sortedRows) {
      for (let box = row.boxStart; box <= row.boxEnd && idx < sorted.length; box++) {
        for (let q = 0; q < row.qtyPerBox && idx < sorted.length; q++, idx++) {
          sorted[idx] = { ...sorted[idx], box_label: `LOT#${row.lotNum} ${box}/${row.totalBoxes}` };
        }
      }
    }
    result.push(...sorted);
  }
  return result;
}

// ─── Cross-reference ───────────────────────────────────────────────

function buildCrossRefChecks(pl: PLData, parsedItems: ParsedItem[]): CheckItem[] {
  const countByPart: Record<string, number> = {};
  for (const item of parsedItems) {
    if (item.status !== "CREATED") continue;
    const key = normPart(item.part_number);
    countByPart[key] = (countByPart[key] ?? 0) + 1;
  }
  return pl.rows
    .map((row) => {
      const actual = countByPart[normPart(row.partNumber)] ?? 0;
      return { label: row.partNumber, passed: actual === row.qtyTotal, detail: `Parsed: ${actual} | PL expected: ${row.qtyTotal}` };
    });
}

// ─── Import summary ────────────────────────────────────────────────

interface PartSummary { added: number; bad: number; manual: number; skipped: number }

function buildImportSummary(items: ParsedItem[]): Record<string, PartSummary> {
  const byPart: Record<string, PartSummary> = {};
  for (const item of items) {
    if (!byPart[item.part_number]) byPart[item.part_number] = { added: 0, bad: 0, manual: 0, skipped: 0 };
    if (item.status === "CREATED") byPart[item.part_number].added++;
    else if (item.status === "BAD") byPart[item.part_number].bad++;
    else if (item.status === "MANUAL") byPart[item.part_number].manual++;
  }
  return byPart;
}

// ─── Config ────────────────────────────────────────────────────────

const ALL_LOT_STATUSES: LotStatus[] = ["DELIVERED", "IN_TRANSIT", "AT_WAREHOUSE", "AT_FACTORY", "DELAYED"];

const LOT_STATUS_CONFIG: Record<LotStatus, { label: string; className: string }> = {
  DELIVERED:    { label: "Delivered",    className: "bg-green-500/15 text-green-400 border-0" },
  IN_TRANSIT:   { label: "In Transit",   className: "bg-blue-500/15 text-blue-400 border-0" },
  AT_WAREHOUSE: { label: "At Warehouse", className: "bg-amber-400/15 text-amber-400 border-0" },
  AT_FACTORY:   { label: "At Factory",   className: "bg-zinc-700 text-zinc-300 border-0" },
  DELAYED:      { label: "Delayed",      className: "bg-red-500/15 text-red-400 border-0" },
};

// ─── Helpers ───────────────────────────────────────────────────────

function CheckIcon({ passed }: { passed: boolean }) {
  if (passed) return <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />;
  return <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />;
}

function fmt(n: number) { return n.toLocaleString(); }

// ─── Page ──────────────────────────────────────────────────────────

export default function LotsPage() {
  const { data: lotImports = [] } = useLotImports();
  const { data: clients = [] } = useClients();
  const { data: allOrders = [] } = useProductionOrders();
  const { data: issueDefinitions = [] } = useIssueDefinitions();
  const { data: kitDefinitions = [] } = useKitDefinitions();
  const eligibleOrders = allOrders.filter((o) =>
    o.production_steps?.some((s) => s.step_number === 5 && s.status === "DONE")
  );

  const createLotImport = useCreateLotImport();
  const updateLotImport = useUpdateLotImport();
  const deleteLotImport = useDeleteLotImport();
  const bulkCreate = useBulkCreateManufacturedItems();

  function handleDeleteLot(lot: LotImport) {
    if (!confirm(`Delete LOT "${lot.lot_number}" and all ${fmt(lot.item_count)} associated items? This cannot be undone.`)) return;
    deleteLotImport.mutate({ id: lot.id, lot_number: lot.lot_number, docx_path: lot.docx_path, xlsx_path: lot.xlsx_path });
  }

  // ── Import dialog state ──
  const [importOpen, setImportOpen] = useState(false);
  const [importLot, setImportLot] = useState("");
  const [importClientId, setImportClientId] = useState("none");
  const [importOrderId, setImportOrderId] = useState("none");

  // Derive expected part numbers from the selected order's kit definitions
  const expectedPartNumbers = useMemo(() => {
    if (importOrderId === "none") return [];
    const order = eligibleOrders.find((o) => o.id === importOrderId);
    if (!order?.items) return [];
    const parts: string[] = [];
    for (const item of order.items) {
      if (item.type !== "KIT" || !item.reference) continue;
      const kitDef = kitDefinitions.find((d) => d.name === item.reference);
      if (!kitDef) continue;
      for (const comp of kitDef.components) {
        if (comp.reference && !parts.includes(comp.reference)) parts.push(comp.reference);
      }
    }
    return parts;
  }, [importOrderId, eligibleOrders, kitDefinitions]);

  // PL
  const [plChecks, setPlChecks] = useState<CheckItem[] | null>(null);
  const [plData, setPlData] = useState<PLData | null>(null);
  const [plError, setPlError] = useState("");
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [docxDragging, setDocxDragging] = useState(false);
  const docxRef = useRef<HTMLInputElement>(null);

  // Serial number file
  const [parsedItems, setParsedItems] = useState<ParsedItem[] | null>(null);
  const [importSummary, setImportSummary] = useState<Record<string, PartSummary> | null>(null);
  const [crossRefChecks, setCrossRefChecks] = useState<CheckItem[] | null>(null);
  const [duplicates, setDuplicates] = useState<{ part_number: string; serial_number: string; lot_number: string | null }[] | null>(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [snError, setSnError] = useState("");
  const [snFile, setSnFile] = useState<File | null>(null);
  const [snDragging, setSnDragging] = useState(false);
  const snFileRef = useRef<HTMLInputElement>(null);
  const gbxRef = useRef<HTMLInputElement>(null);
  const [gbxDragging, setGbxDragging] = useState(false);

  function openImport() {
    setPlChecks(null); setPlData(null); setPlError(""); setDocxFile(null);
    setParsedItems(null); setImportSummary(null); setCrossRefChecks(null); setSnError(""); setSnFile(null);
    setImportLot(""); setImportClientId("none"); setImportOrderId("none");
    setImportOpen(true);
  }

  function handleGBXFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast.error("Could not read the GBX file.");
    reader.onload = (ev) => {
      try {
        const gbx = JSON.parse(ev.target?.result as string) as GBXLotFile;
        if (gbx.gbx_version !== "1" || !gbx.items) throw new Error("Invalid GBX file format.");

        // Populate all dialog state from the GBX file
        setImportLot(gbx.lot_number);

        if (gbx.packing_list) {
          const plData: PLData = {
            summary: {
              totalBoxes: gbx.packing_list.summary.total_boxes,
              totalParts: gbx.packing_list.summary.total_parts,
              totalVolume: gbx.packing_list.summary.total_volume,
              totalWeight: gbx.packing_list.summary.total_weight,
            },
            rows: gbx.packing_list.rows.map(r => ({
              partNumber: r.part_number, size: r.size,
              volumePerBox: r.volume_per_box, weightPerBox: r.weight_per_box,
              boxes: r.boxes, qtyPerBox: r.qty_per_box, qtyTotal: r.qty_total,
              label: r.box_label, boxStart: r.box_start, boxEnd: r.box_end,
              lotNum: r.lot_num, totalBoxes: r.total_boxes,
            })),
          };
          setPlData(plData);
          setPlChecks(buildPLChecklist(plData));
          const parsed = gbx.items.map(i => ({
            part_number: i.part_number, serial_number: i.serial_number,
            lot_number: i.lot_number, status: i.status as ManufacturedItemStatus,
            box_label: i.box_label, issue: i.issue,
          }));
          setParsedItems(parsed);
          setImportSummary(buildImportSummary(parsed));
          setCrossRefChecks(buildCrossRefChecks(plData, parsed));
          checkForDuplicates(parsed);
        } else {
          const parsed = gbx.items.map(i => ({
            part_number: i.part_number, serial_number: i.serial_number,
            lot_number: i.lot_number, status: i.status as ManufacturedItemStatus,
            box_label: i.box_label, issue: i.issue,
          }));
          setParsedItems(parsed);
          setImportSummary(buildImportSummary(parsed));
          checkForDuplicates(parsed);
        }

        setPlError(""); setSnError("");
        toast.success(`GBX file loaded — ${gbx.items.length} items ready to import`);
      } catch (err) {
        toast.error(`GBX parse error: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleDocxChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocxFile(file);
    setPlError(""); setPlChecks(null); setPlData(null);
    setParsedItems(null); setImportSummary(null); setCrossRefChecks(null);
    const reader = new FileReader();
    reader.onerror = () => setPlError("Could not read the file.");
    reader.onload = async (ev) => {
      try {
        const pl = await parseDocxPL(ev.target?.result as ArrayBuffer);
        setPlData(pl);
        setPlChecks(buildPLChecklist(pl));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[DOCX PARSE ERROR]", err);
        setPlError(`Parse error: ${msg}`);
        toast.error(`DOCX parse error: ${msg}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  async function checkForDuplicates(parsed: ParsedItem[]) {
    setCheckingDuplicates(true);
    setDuplicates(null);
    try {
      const supabase = createClient();
      const groups: Record<string, string[]> = {};
      for (const item of parsed) {
        if (!groups[item.part_number]) groups[item.part_number] = [];
        groups[item.part_number].push(item.serial_number);
      }
      const found: { part_number: string; serial_number: string; lot_number: string | null }[] = [];
      for (const [partNumber, serials] of Object.entries(groups)) {
        const { data } = await supabase
          .from("manufactured_items")
          .select("part_number, serial_number, lot_number")
          .eq("part_number", partNumber)
          .in("serial_number", serials);
        if (data) found.push(...data);
      }
      setDuplicates(found);
    } catch {
      setDuplicates([]);
    } finally {
      setCheckingDuplicates(false);
    }
  }

  function handleSnFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !importLot.trim()) { setSnError("Enter a LOT # first."); return; }
    setSnFile(file);
    setSnError(""); setParsedItems(null); setImportSummary(null); setCrossRefChecks(null); setDuplicates(null);

    const isCSV = file.name.toLowerCase().endsWith(".csv");
    const reader = new FileReader();
    reader.onerror = () => setSnError("Could not read the file.");

    if (isCSV) {
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          const raw = parseCSVLot(text, importLot.trim());
          if (raw.length === 0) { setSnError("No valid items found in the file."); return; }
          const parsed = assignBoxLabels(raw, plData);
          setParsedItems(parsed);
          setImportSummary(buildImportSummary(parsed));
          if (plData) setCrossRefChecks(buildCrossRefChecks(plData, parsed));
          checkForDuplicates(parsed);
        } catch (err) {
          setSnError(`Parse error: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = (ev) => {
        try {
          const raw = parseExcelLot(ev.target?.result as ArrayBuffer, importLot.trim(), issueDefinitions, expectedPartNumbers);
          if (raw.length === 0) { setSnError("No valid items found in the file."); return; }
          const parsed = assignBoxLabels(raw, plData);
          setParsedItems(parsed);
          setImportSummary(buildImportSummary(parsed));
          if (plData) setCrossRefChecks(buildCrossRefChecks(plData, parsed));
          checkForDuplicates(parsed);
        } catch (err) {
          setSnError(`Parse error: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      };
      reader.readAsArrayBuffer(file);
    }
    e.target.value = "";
  }

  async function handleImportConfirm() {
    if (!parsedItems) return;
    const lot = importLot.trim();
    const clientId = importClientId !== "none" ? importClientId : undefined;
    const supabase = createClient();

    let docxPath: string | null = null;
    let snPath: string | null = null;

    if (docxFile) {
      const path = `${lot}/${lot}_packing_list.docx`;
      const { error } = await supabase.storage.from("lot-documents").upload(path, docxFile, { upsert: true });
      if (error) toast.error(`Could not save packing list: ${error.message}`);
      else docxPath = path;
    }
    if (snFile) {
      const ext = snFile.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
      const path = `${lot}/${lot}_serial_numbers.${ext}`;
      const { error } = await supabase.storage.from("lot-documents").upload(path, snFile, { upsert: true });
      if (error) toast.error(`Could not save serial number file: ${error.message}`);
      else snPath = path;
    }

    const orderId = importOrderId !== "none" ? importOrderId : undefined;
    await createLotImport.mutateAsync({
      lot_number: lot,
      ...(docxPath && { docx_path: docxPath }),
      ...(snPath && { xlsx_path: snPath }),
      item_count: parsedItems.length,
      ...(clientId && { client_id: clientId }),
      ...(orderId && { production_order_id: orderId }),
      lot_status: "AT_FACTORY",
    });

    const itemsWithClient = parsedItems.map((item) => ({
      ...item,
      location: "GBX" as const,
      ...(clientId && { client_id: clientId }),
    }));
    await bulkCreate.mutateAsync(itemsWithClient);
    setImportOpen(false);
  }

  async function handleDownload(lotImport: LotImport, type: "docx" | "xlsx") {
    const path = type === "docx" ? lotImport.docx_path : lotImport.xlsx_path;
    if (!path) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("lot-documents").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error("Could not generate download link"); return; }
    window.open(data.signedUrl, "_blank");
  }

  function toggleApproval(lot: LotImport, field: "pl_approved" | "serial_approved") {
    const current = field === "pl_approved" ? (lot.pl_approved ?? false) : (lot.serial_approved ?? false);
    updateLotImport.mutate({ id: lot.id, updates: { [field]: !current } });
  }

  function handleStatusChange(lot: LotImport, status: LotStatus) {
    updateLotImport.mutate({ id: lot.id, updates: { lot_status: status } });
  }

  const allPlPassed = plChecks?.every((c) => c.passed) ?? false;
  const isImporting = bulkCreate.isPending || createLotImport.isPending;

  const summaryTotals = importSummary
    ? Object.values(importSummary).reduce((acc, v) => ({ added: acc.added + v.added, bad: acc.bad + v.bad, manual: acc.manual + v.manual }), { added: 0, bad: 0, manual: 0 })
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Lots</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{lotImports.length > 0 ? `${lotImports.length} lot${lotImports.length === 1 ? "" : "s"} imported` : "No lots imported yet"}</p>
        </div>
        <Button variant="outline" onClick={openImport} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Import LOT
        </Button>
      </div>

      {/* Lots Table */}
      <div className="rounded-lg border border-zinc-800 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-500 w-12">#</TableHead>
              <TableHead className="text-zinc-500">LOT Name</TableHead>
              <TableHead className="text-zinc-500">Date Created</TableHead>
              <TableHead className="text-zinc-500 text-center">PL Approved</TableHead>
              <TableHead className="text-zinc-500 text-center">Serial Approved</TableHead>
              <TableHead className="text-zinc-500">Status</TableHead>
              <TableHead className="text-zinc-500">Production Order</TableHead>
              <TableHead className="text-zinc-500">Client</TableHead>
              <TableHead className="text-zinc-500 text-right">Items</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotImports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-zinc-500 py-12">
                  No lots yet. Click &quot;Import LOT&quot; to get started.
                </TableCell>
              </TableRow>
            ) : lotImports.map((lot, i) => {
              const plApproved = lot.pl_approved ?? false;
              const serialApproved = lot.serial_approved ?? false;
              const lotStatus: LotStatus = lot.lot_status ?? "AT_FACTORY";
              return (
                <TableRow key={lot.id} className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableCell className="text-zinc-500 text-sm">{i + 1}</TableCell>
                  <TableCell className="text-zinc-100 font-mono font-medium text-sm">{lot.lot_number}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{formatDate(lot.created_at)}</TableCell>
                  <TableCell className="text-center">
                    <button
                      onClick={() => toggleApproval(lot, "pl_approved")}
                      className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors ${plApproved ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-zinc-800 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-400"}`}
                      title={plApproved ? "PL Approved — click to revoke" : "Click to approve PL"}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      onClick={() => toggleApproval(lot, "serial_approved")}
                      className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors ${serialApproved ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-zinc-800 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-400"}`}
                      title={serialApproved ? "Serial Approved — click to revoke" : "Click to approve serials"}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                  <TableCell>
                    <Select value={lotStatus} onValueChange={(v) => handleStatusChange(lot, v as LotStatus)}>
                      <SelectTrigger className="h-7 w-36 text-xs bg-transparent border-0 p-0 gap-1 focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
                        <Badge className={`${LOT_STATUS_CONFIG[lotStatus].className} cursor-pointer`}>
                          {LOT_STATUS_CONFIG[lotStatus].label}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        {ALL_LOT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="text-zinc-100 text-xs">
                            {LOT_STATUS_CONFIG[s].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm font-mono">{lot.production_orders?.order_number ?? <span className="text-zinc-600">—</span>}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{lot.clients?.name ?? <span className="text-zinc-600">—</span>}</TableCell>
                  <TableCell className="text-zinc-400 text-sm text-right">{fmt(lot.item_count)}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleDeleteLot(lot)}
                      disabled={deleteLotImport.isPending}
                      className="p-1 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
                      title={`Delete LOT ${lot.lot_number} and all items`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Import LOT Dialog ── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import LOT</DialogTitle>
            <p className="text-zinc-500 text-sm">Upload the Packing List to validate, then the serial number file (.csv or .xlsx). Both files are saved as records.</p>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* GBX Quick Import */}
            <div
              onClick={() => gbxRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setGbxDragging(true); }}
              onDragLeave={() => setGbxDragging(false)}
              onDrop={e => {
                e.preventDefault(); setGbxDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleGBXFileChange({ target: { files: e.dataTransfer.files, value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>);
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                gbxDragging ? "border-[#16a34a] bg-[#16a34a]/10" : "border-zinc-700 hover:border-[#16a34a]/60 hover:bg-[#16a34a]/5"
              }`}
            >
              <FileCode2 className="h-4 w-4 text-[#16a34a] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-300">Have a GBX file?</p>
                <p className="text-xs text-zinc-500">Click or drag a <span className="font-mono">_gbx.json</span> file — auto-fills all steps</p>
              </div>
              <input ref={gbxRef} type="file" accept=".json" className="hidden" onChange={handleGBXFileChange} />
            </div>

            <div className="flex items-center gap-2">
              <Separator className="flex-1 bg-zinc-800" />
              <span className="text-zinc-600 text-xs px-1">or process files manually</span>
              <Separator className="flex-1 bg-zinc-800" />
            </div>

            {/* LOT # + Client + Production Order */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-300">LOT #</Label>
                <Input placeholder="e.g. LOT1" value={importLot} onChange={(e) => setImportLot(e.target.value)} className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Client <span className="text-zinc-500 font-normal">(optional)</span></Label>
                <Select value={importClientId} onValueChange={setImportClientId}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100"><SelectValue placeholder="Select client..." /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="none" className="text-zinc-400">No client</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id} className="text-zinc-100">{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Production Order <span className="text-zinc-500 font-normal">(optional)</span></Label>
                <Select value={importOrderId} onValueChange={setImportOrderId}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100"><SelectValue placeholder="Select order..." /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="none" className="text-zinc-400">No order</SelectItem>
                    {eligibleOrders.map((o) => (
                      <SelectItem key={o.id} value={o.id} className="text-zinc-100">{o.order_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {importClientId !== "none" && (
              <p className="text-xs text-blue-400 -mt-2">
                All items will be assigned to <strong>{clients.find(c => c.id === importClientId)?.name}</strong>
              </p>
            )}

            <Separator className="bg-zinc-800" />

            {/* Step 1: Packing List */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold bg-zinc-700 text-zinc-300 rounded-full w-5 h-5 flex items-center justify-center">1</span>
                <Label className="text-zinc-300">Packing List (.docx) <span className="text-zinc-500 font-normal">— optional but recommended</span></Label>
                {allPlPassed && <CheckCircle2 className="h-4 w-4 text-green-400" />}
              </div>
              <div
                onClick={() => docxRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDocxDragging(true); }}
                onDragLeave={() => setDocxDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDocxDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleDocxChange({ target: { files: e.dataTransfer.files, value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${docxDragging ? "border-purple-500 bg-purple-500/10" : "border-zinc-600 hover:border-zinc-400"}`}>
                <Upload className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                <span className="text-sm text-zinc-400 truncate">
                  {plChecks ? `${docxFile?.name} — ${plChecks.filter(c => c.passed).length}/${plChecks.length} checks passed` : docxDragging ? "Drop .docx here" : "Click or drag .docx packing list"}
                </span>
                <input ref={docxRef} type="file" accept=".docx" className="hidden" onChange={handleDocxChange} />
              </div>
              {plError && <p className="text-red-400 text-xs">{plError}</p>}
              {plChecks && (
                <div className="bg-zinc-800/60 rounded-lg p-3 space-y-2">
                  <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2">Packing List Validation</p>
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

            {/* Step 2: Serial Number File */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold bg-zinc-700 text-zinc-300 rounded-full w-5 h-5 flex items-center justify-center">2</span>
                <Label className="text-zinc-300">Serial Number File <span className="text-zinc-500 font-normal">(.csv or .xlsx)</span></Label>
                {parsedItems && !crossRefChecks && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                {crossRefChecks && crossRefChecks.every(c => c.passed) && <CheckCircle2 className="h-4 w-4 text-green-400" />}
              </div>
              <div
                onClick={() => importLot.trim() && snFileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); if (importLot.trim()) setSnDragging(true); }}
                onDragLeave={() => setSnDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setSnDragging(false);
                  if (!importLot.trim()) return;
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleSnFileChange({ target: { files: e.dataTransfer.files, value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed transition-colors ${
                  !importLot.trim() ? "border-zinc-800 opacity-50 cursor-not-allowed"
                  : snDragging ? "border-purple-500 bg-purple-500/10 cursor-pointer"
                  : "border-zinc-600 hover:border-zinc-400 cursor-pointer"
                }`}>
                <Upload className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                <span className="text-sm text-zinc-400 truncate">
                  {parsedItems ? `${snFile?.name} — ${fmt(parsedItems.length)} items parsed` : snDragging ? "Drop .csv or .xlsx here" : "Click or drag .csv or .xlsx"}
                </span>
                <input ref={snFileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleSnFileChange} />
              </div>
              {snError && <p className="text-red-400 text-xs">{snError}</p>}

              {/* Import breakdown */}
              {importSummary && summaryTotals && (
                <div className="bg-zinc-800/60 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2">Import Breakdown</p>
                  <div className="space-y-1">
                    {Object.entries(importSummary).map(([part, counts]) => (
                      <div key={part} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
                        <span className="text-zinc-300 text-xs font-mono truncate">{part}</span>
                        <span className="text-zinc-400 text-xs">{fmt(counts.added)} added</span>
                        {counts.bad > 0 && <span className="text-red-400 text-xs">{counts.bad} bad</span>}
                        {counts.manual > 0 && <span className="text-purple-400 text-xs">{counts.manual} manual</span>}
                        {counts.bad === 0 && <span />}
                        {counts.manual === 0 && <span />}
                      </div>
                    ))}
                    <Separator className="bg-zinc-700 my-2" />
                    <div className="flex gap-4 text-xs font-medium">
                      <span className="text-zinc-300">{fmt(summaryTotals.added)} Added</span>
                      {summaryTotals.bad > 0 && <span className="text-red-400">{fmt(summaryTotals.bad)} Bad</span>}
                      {summaryTotals.manual > 0 && <span className="text-purple-400">{fmt(summaryTotals.manual)} Manual</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Duplicate check */}
              {(checkingDuplicates || duplicates !== null) && (
                <div className={`rounded-lg p-3 space-y-2 ${duplicates && duplicates.length > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-zinc-800/60"}`}>
                  <p className={`text-xs font-medium uppercase tracking-wider ${duplicates && duplicates.length > 0 ? "text-red-400" : "text-zinc-500"}`}>
                    Duplicate Serial Check
                  </p>
                  {checkingDuplicates && (
                    <p className="text-zinc-500 text-xs">Checking against existing inventory…</p>
                  )}
                  {!checkingDuplicates && duplicates !== null && duplicates.length === 0 && (
                    <div className="flex items-center gap-1.5 text-green-400 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      No duplicate serial numbers found
                    </div>
                  )}
                  {!checkingDuplicates && duplicates && duplicates.length > 0 && (
                    <>
                      <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {duplicates.length} serial number{duplicates.length !== 1 ? "s" : ""} already exist in inventory — will be skipped
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto mt-1">
                        {Object.entries(
                          duplicates.reduce((acc, d) => {
                            if (!acc[d.part_number]) acc[d.part_number] = [];
                            acc[d.part_number].push(d);
                            return acc;
                          }, {} as Record<string, typeof duplicates>)
                        ).map(([part, items]) => (
                          <div key={part}>
                            <p className="text-zinc-400 text-[10px] font-mono font-medium mb-0.5">{part}</p>
                            {items.map((d, i) => (
                              <div key={i} className="flex justify-between text-[10px] pl-2">
                                <span className="font-mono text-red-300">{d.serial_number}</span>
                                <span className="text-zinc-500">{d.lot_number ? `→ ${d.lot_number}` : "→ no LOT"}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Cross-reference */}
              {crossRefChecks && (
                <div className="bg-zinc-800/60 rounded-lg p-3 space-y-2">
                  <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2">Cross-Reference vs Packing List <span className="text-zinc-600 normal-case">(ADDED only)</span></p>
                  {crossRefChecks.map((check, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckIcon passed={check.passed} />
                      <div className="flex-1 min-w-0">
                        <span className="text-zinc-300 text-xs font-mono">{check.label}</span>
                        <span className={`text-xs ml-2 ${check.passed ? "text-zinc-500" : "text-red-400"}`}>{check.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setImportOpen(false)}>Cancel</Button>
              <Button disabled={!parsedItems || isImporting} onClick={handleImportConfirm} className="flex-1 bg-[#16a34a] hover:bg-[#15803d] text-white">
                {isImporting ? "Saving..." : parsedItems ? `Import ${fmt(parsedItems.length)} Items` : "Import"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
