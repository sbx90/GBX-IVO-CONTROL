"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  FileSpreadsheet, Upload, CheckCircle2, XCircle, Download, FileText, Trash2, AlertTriangle, FileCode2, Wrench, ChevronRight, ChevronDown, MapPin, Pencil, Plus, Tag, ArrowUp, ArrowDown, ArrowUpDown,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  useOrderPendingIssues,
  useResolveIssues,
  useUpdateLotItemsLocation,
  useLotItemCounts,
  useSubtractLotItems,
  useManufacturedLotCounts,
  useLotLocations,
} from "@/hooks/use-manufactured";
import { useProductCatalog } from "@/hooks/use-product-catalog";
import { useClients } from "@/hooks/use-clients";
import { useProductionOrders } from "@/hooks/use-production";
import { useIssueDefinitions } from "@/hooks/use-issue-definitions";
import { useKitDefinitions } from "@/hooks/use-kit-definitions";
import { formatDate } from "@/lib/utils";
import { LOCATION_OPTIONS, LOCATION_CONFIG } from "@/lib/constants";
import type { ManufacturedItemStatus, ManufacturedItemLocation, CreateManufacturedItemInput, LotImport, LotStatus, IssueDefinition } from "@/lib/types/database";
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

interface CrossRefRow {
  partNumber: string;
  parsed: number;     // total items found in Excel column
  clean: number;      // items with no issue (packed, fulfilling PL)
  issues: number;     // items with issue flag (kept at factory, not packed)
  plExpected: number; // qty stated in packing list
  fulfilled: boolean; // clean === plExpected
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

// _isException: true = item was below the blank separator (not a PL item, not saved to DB)
// _boxNum: box number from Excel adjacent column (numeric, carry-forward per column)
type ParsedItem = CreateManufacturedItemInput & { _isException?: boolean; _boxNum?: number };

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

function parseCSVLot(csvText: string, lotNumber: string, issueDefs: IssueDefinition[] = []): ParsedItem[] {
  const rows = parseCSVRows(csvText);
  if (rows.length < 2) return [];

  console.log(`[LOT PARSER] Total CSV rows (incl. header): ${rows.length}`);

  const headerRow = rows[0];
  function csvIsCountCol(col: number): boolean {
    let seen = 0;
    for (let r = 1; r < Math.min(11, rows.length); r++) {
      const v = rows[r][col]?.trim();
      if (!v) continue;
      const n = parseInt(v, 10);
      if (isNaN(n) || n <= 0 || n >= 10000) return false;
      seen++;
    }
    return seen > 0;
  }

  interface ColDef { col: number; partNumber: string; type: "individual" | "range" | "count" | "skip" }
  const cols: ColDef[] = [];
  for (let c = 0; c < headerRow.length; c += 2) {
    const h = headerRow[c]?.trim();
    if (!h) continue;
    let type: ColDef["type"];
    if (c === 8 || c === 10) type = "range";
    else if (csvIsCountCol(c)) type = "count";
    else type = "individual";
    cols.push({ col: c, partNumber: h, type });
  }

  const colLetters = (i: number) => String.fromCharCode(65 + i);
  console.log(`[LOT PARSER] Detected columns:`, cols.map(c => `${colLetters(c.col)}=${c.partNumber}(${c.type})`).join(", "));

  const dataColIndices = cols.filter(c => c.type !== "skip" && c.type !== "count").map(c => c.col);
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

    if (col.type === "count") {
      let totalCount = 0;
      for (let r = 1; r < normalEnd; r++) {
        const val = rows[r][col.col]?.trim();
        if (!val) continue;
        const qty = parseInt(val, 10);
        if (isNaN(qty) || qty <= 0) continue;
        const boxId = rows[r][col.col + 1]?.trim() || `R${r}`;
        totalCount += qty;
        for (let i = 1; i <= qty; i++) {
          items.push({ part_number: col.partNumber, serial_number: `${boxId}-${String(i).padStart(3, "0")}`, lot_number: lotNumber, status: "OK" });
        }
      }
      console.log(`[LOT PARSER] ${colLetters(col.col)} (${col.partNumber}): count column → ${totalCount} items`);
    } else if (col.type === "individual") {
      const statusCounts: Record<string, number> = { OK: 0, MANUAL: 0, SKIP: 0, exception: 0 };
      for (let r = 1; r < rows.length; r++) {
        const val = rows[r][col.col]?.trim();
        if (!val) continue;
        if (!/^\d+(\.\d+)?$/.test(val)) continue;
        const sn = val.includes(".") ? val.split(".")[0] : val;
        const note = (rows[r][col.col + 1] ?? "").trim().toLowerCase();
        const isException = separatorRow > 0 && r > separatorRow;
        // "missing" only skips exception items — pre-blank PL items are always imported
        if (isException && note === "missing") { statusCounts.SKIP++; continue; }
        // Pre-blank PL items always import as OK regardless of adjacent comment
        const status: ManufacturedItemStatus = isException && note.includes("taken by you") ? "MANUAL" : "OK";
        const issue = (isException && note && !note.includes("taken by you")) ? matchIssue(note, issueDefs) : null;
        if (isException) statusCounts.exception++; else statusCounts.OK++;
        items.push({ part_number: col.partNumber, serial_number: sn, lot_number: lotNumber, status, issue, _isException: isException || undefined });
      }
      console.log(
        `[LOT PARSER] ${colLetters(col.col)} (${col.partNumber}): ` +
        `OK=${statusCounts.OK} MANUAL=${statusCounts.MANUAL} exception=${statusCounts.exception} SKIP=${statusCounts.SKIP}`
      );
    } else {
      let rangeCount = 0, excCount = 0;
      const rawRanges: string[] = [];
      for (let r = 1; r < rows.length; r++) {
        const val = rows[r][col.col]?.trim();
        if (!val) continue;
        if (!val.includes("-")) continue;
        rawRanges.push(val);
        const isException = separatorRow > 0 && r > separatorRow;
        const expanded = expandRange(val);
        if (isException) excCount += expanded.length; else rangeCount += expanded.length;
        for (const sn of expanded) {
          items.push({ part_number: col.partNumber, serial_number: sn, lot_number: lotNumber, status: "OK", _isException: isException || undefined });
        }
      }
      console.log(
        `[LOT PARSER] ${colLetters(col.col)} (${col.partNumber}): ` +
        `range column — ranges: [${rawRanges.join(", ")}] → PL=${rangeCount} exception=${excCount}`
      );
    }
  }

  const totalByStatus = items.reduce((acc, i) => { const s = i.status ?? "OK"; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Record<string, number>);
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

  // Fix stale/truncated !ref: expand to cover all actual cells
  const origRef = ws['!ref'] ?? "A1";
  const allCellKeys = Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k));
  if (allCellKeys.length > 0) {
    const range = XLSX.utils.decode_range(origRef);
    for (const key of allCellKeys) {
      const addr = XLSX.utils.decode_cell(key);
      if (addr.r > range.e.r) range.e.r = addr.r;
      if (addr.c > range.e.c) range.e.c = addr.c;
    }
    const newRef = XLSX.utils.encode_range(range);
    if (newRef !== origRef) {
      ws['!ref'] = newRef;
      console.log(`[EXCEL PARSER] Expanded !ref from ${origRef} to ${newRef}`);
    }
  }

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1 });
  if (rows.length === 0) return [];

  console.log(`[EXCEL PARSER] Total rows (incl. header): ${rows.length} (ref: ${ws['!ref']})`);

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
  const componentCols: { col: number; partNumber: string; isRange: boolean; isCount: boolean }[] = [];

  const matchedCols = new Set<number>();

  // Detect count columns: values are small integers (quantities, not serial numbers)
  function isCountCol(col: number): boolean {
    let seen = 0;
    for (let r = dataStart; r < Math.min(dataStart + 10, rows.length); r++) {
      const v = (rows[r] as (string | number | null)[])[col];
      if (v == null || v === "") continue;
      const n = typeof v === "number" ? v : parseInt(v.toString(), 10);
      if (isNaN(n) || n <= 0 || n >= 10000) return false;
      seen++;
    }
    return seen > 0;
  }

  if (knownPartNumbers.length > 0) {
    for (let c = 0; c < header.length; c++) {
      const h = header[c];
      if (!h || typeof h !== "string") continue;
      const matched = knownPartNumbers.find(pn => pn.trim().toUpperCase() === h.trim().toUpperCase());
      if (matched) {
        componentCols.push({ col: c, partNumber: matched, isRange: matched.toUpperCase().includes("PS") || matched.toUpperCase().includes("CDL"), isCount: isCountCol(c) });
        matchedCols.add(c);
      }
    }
    const unmatched = knownPartNumbers.filter(pn => !componentCols.some(c => c.partNumber === pn));
    if (unmatched.length > 0) console.warn(`[EXCEL PARSER] Part numbers from kit def not found in Excel:`, unmatched);
  }

  // Scan even columns for part-number-like headers not already matched
  for (let c = 0; c < header.length; c += 2) {
    if (matchedCols.has(c)) continue;
    const h = header[c];
    if (!h || typeof h !== "string") continue;
    if (h.includes("-") || h.includes("_")) {
      componentCols.push({ col: c, partNumber: h, isRange: h.toUpperCase().includes("PS") || h.toUpperCase().includes("CDL"), isCount: isCountCol(c) });
      matchedCols.add(c);
    }
  }

  const colLetters = (i: number) => String.fromCharCode(65 + i);
  console.log(`[EXCEL PARSER] Detected columns:`, componentCols.map(c => `${colLetters(c.col)}=${c.partNumber}(${c.isCount ? "count" : c.isRange ? "range" : "individual"})`).join(", "));

  // Use only non-count columns to detect the separator row. Count columns (e.g. RCW1)
  // may have data in rows that correspond to the blank separator between PL items and
  // exception items, which would prevent detection if included.
  const separatorColIndices = componentCols.filter(c => !c.isCount).map(c => c.col);
  let separatorRow = -1;
  for (let r = dataStart + 1; r < rows.length; r++) {
    const row = rows[r] as (string | number | null)[];
    if (separatorColIndices.every(ci => row[ci] == null || row[ci] === "")) {
      separatorRow = r;
      break;
    }
  }
  console.log(`[EXCEL PARSER] Separator row: ${separatorRow === -1 ? "NOT FOUND" : `index ${separatorRow} (file row ${separatorRow + 1})`}`);
  const normalEnd = separatorRow > 0 ? separatorRow : rows.length;

  const items: ParsedItem[] = [];

  // Build a map of row → comment text for each odd column (B=1, D=3, F=5, H=7…)
  // Post-blank exception rows use text comments (e.g. "Not sent", "Failed MB")
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

  // Build a map of row → box number for each odd column
  // Pre-blank rows: adjacent odd col contains a NUMERIC box number (e.g. 1, 2, 12)
  // The number only appears once when the box changes — carry-forward handles the rest
  const colBoxNums = new Map<number, Map<number, number>>();
  for (const key of Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k))) {
    const { r, c } = XLSX.utils.decode_cell(key);
    if (c % 2 !== 1) continue; // odd columns only
    const cell = ws[key];
    if (cell?.v == null || typeof cell.v !== 'number') continue;
    const numVal = Math.round(cell.v);
    if (numVal <= 0 || numVal > 999) continue; // box numbers are small positive integers
    if (!colBoxNums.has(c)) colBoxNums.set(c, new Map());
    colBoxNums.get(c)!.set(r, numVal);
  }

  for (const comp of componentCols) {
    if (comp.isCount) {
      // Count column: each cell is a quantity (e.g. 100). Adjacent col holds box ID.
      // Expand into individual items with synthetic serial numbers: {boxId}-{padded_index}
      let totalCount = 0;
      for (let r = dataStart; r < normalEnd; r++) {
        const row = rows[r] as (string | number | null)[];
        const val = row[comp.col];
        if (val == null || val === "") continue;
        const qty = typeof val === "number" ? val : parseInt(val.toString(), 10);
        if (isNaN(qty) || qty <= 0) continue;
        const boxRaw = row[comp.col + 1];
        const boxId = boxRaw != null && boxRaw !== "" ? boxRaw.toString().trim() : `R${r - dataStart + 1}`;
        totalCount += qty;
        for (let i = 1; i <= qty; i++) {
          const sn = `${boxId}-${String(i).padStart(3, "0")}`;
          items.push({ part_number: comp.partNumber, serial_number: sn, lot_number: lotNumber, status: "OK", issue: null });
        }
      }
      console.log(`[EXCEL PARSER] ${colLetters(comp.col)} (${comp.partNumber}): count column → ${totalCount} items`);
    } else if (comp.isRange) {
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
          items.push({ part_number: comp.partNumber, serial_number: sn, lot_number: lotNumber, status: "OK", issue: null });
        }
      }
      console.log(`[EXCEL PARSER] ${colLetters(comp.col)} (${comp.partNumber}): ranges [${rawRanges.join(", ")}] → ADDED=${rangeCount}`);
    } else {
      // Per-column: collect ALL items. Items below the blank separator are marked
      // _isException=true (shown in preview but not saved to DB).
      const statusCounts = { OK: 0, MANUAL: 0, SKIP: 0, exception: 0 };
      let firstAddedRow = -1, lastAddedRow = -1;
      let currentBoxNum: number | null = null;
      for (let r = dataStart; r < rows.length; r++) {
        const row = rows[r] as (string | number | null)[];
        const val = row[comp.col];
        if (val == null || val === "") continue;
        const strVal = val.toString().trim();
        if (!(typeof val === "number" || /^\d+$/.test(strVal))) continue;
        // Track box number from adjacent column (numeric, carry-forward)
        const boxNumAtRow = colBoxNums.get(comp.col + 1)?.get(r);
        if (boxNumAtRow != null) currentBoxNum = boxNumAtRow;
        const adjComment = colComments.get(comp.col + 1)?.get(r) ?? null;
        const commentLower = adjComment?.toLowerCase() ?? "";
        const isException = separatorRow > 0 && r > separatorRow;
        // "missing" only skips exception items — pre-blank PL items are always imported
        if (isException && commentLower === "missing") { statusCounts.SKIP++; continue; }
        // Pre-blank PL items always import as OK regardless of adjacent comment
        const status: ManufacturedItemStatus = isException && commentLower.includes("taken by you") ? "MANUAL" : "OK";
        const issue = (isException && adjComment && !commentLower.includes("taken by you")) ? matchIssue(adjComment, issueDefs) : null;
        if (isException) statusCounts.exception++; else statusCounts.OK++;
        const _boxNum = !isException && currentBoxNum != null ? currentBoxNum : undefined;
        items.push({ part_number: comp.partNumber, serial_number: strVal, lot_number: lotNumber, status, issue, _isException: isException || undefined, _boxNum });
        if (firstAddedRow === -1) firstAddedRow = r;
        lastAddedRow = r;
      }
      const col = colLetters(comp.col);
      const addedRange = firstAddedRow !== -1 ? `${col}${firstAddedRow + 1}:${col}${lastAddedRow + 1}` : "—";
      console.log(`[EXCEL PARSER] ${col} (${comp.partNumber}): ${statusCounts.OK} PL + ${statusCounts.exception} exception + ${statusCounts.MANUAL} MANUAL + ${statusCounts.SKIP} skipped, range ${addedRange}`);
    }
  }

  const totalByStatus = items.reduce((acc, i) => { const s = i.status ?? "OK"; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Record<string, number>);
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

    // If items have _boxNum from Excel adjacent column, use those directly (accurate)
    const hasExcelBoxNums = partItems.some(i => i._boxNum != null);
    if (hasExcelBoxNums) {
      const firstRow = [...plRows].sort((a, b) => a.boxStart - b.boxStart)[0];
      const labeled = partItems.map(item => ({
        ...item,
        box_label: item._boxNum != null && !item._isException
          ? `LOT#${firstRow.lotNum} ${item._boxNum}/${firstRow.totalBoxes}`
          : (item.box_label ?? null),
      }));
      result.push(...labeled);
      continue;
    }

    // Fallback: positional assignment from PL (for count/range cols without _boxNum)
    const sorted = [...partItems].sort((a, b) =>
      (parseInt(a.serial_number, 10) || 0) - (parseInt(b.serial_number, 10) || 0)
    );
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

function buildCrossRefChecks(pl: PLData, parsedItems: ParsedItem[]): CrossRefRow[] {
  const totalByPart: Record<string, number> = {};
  const cleanByPart: Record<string, number> = {};
  const issuesByPart: Record<string, number> = {};
  for (const item of parsedItems) {
    const key = normPart(item.part_number);
    totalByPart[key] = (totalByPart[key] ?? 0) + 1;
    if (item.issue) {
      issuesByPart[key] = (issuesByPart[key] ?? 0) + 1;
    } else {
      cleanByPart[key] = (cleanByPart[key] ?? 0) + 1;
    }
  }
  return pl.rows.map((row) => {
    const key = normPart(row.partNumber);
    const parsed = totalByPart[key] ?? 0;
    const clean = cleanByPart[key] ?? 0;
    const issues = issuesByPart[key] ?? 0;
    const plExpected = row.qtyTotal;
    return { partNumber: row.partNumber, parsed, clean, issues, plExpected, fulfilled: parsed === plExpected };
  });
}

// ─── Import summary ────────────────────────────────────────────────

interface PartSummary { added: number; bad: number; manual: number; skipped: number }

function buildImportSummary(items: ParsedItem[]): Record<string, PartSummary> {
  const byPart: Record<string, PartSummary> = {};
  for (const item of items) {
    if (!byPart[item.part_number]) byPart[item.part_number] = { added: 0, bad: 0, manual: 0, skipped: 0 };
    if (item.status === "MANUAL") byPart[item.part_number].manual++;
    else if (item.issue) byPart[item.part_number].bad++; // OK products with a known issue
    else byPart[item.part_number].added++;
  }
  return byPart;
}

// ─── Config ────────────────────────────────────────────────────────

const ALL_LOT_STATUSES: LotStatus[] = ["PRODUCTION", "QA", "PACKED", "TRANSIT", "GBX_WAREHOUSE", "FREIGHT_FORWARDER", "CLIENT_WAREHOUSE"];

const LOT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PRODUCTION:        { label: "Production",        className: "bg-violet-500/15 text-violet-400 border-0" },
  QA:                { label: "Q&A",               className: "bg-yellow-500/15 text-yellow-400 border-0" },
  PACKED:            { label: "Packed",             className: "bg-zinc-500/15 text-zinc-300 border-0" },
  TRANSIT:           { label: "Transit",            className: "bg-sky-500/15 text-sky-400 border-0" },
  GBX_WAREHOUSE:     { label: "GBX Warehouse",      className: "bg-blue-500/15 text-blue-400 border-0" },
  FREIGHT_FORWARDER: { label: "Freight-Forwarder",  className: "bg-cyan-500/15 text-cyan-400 border-0" },
  CLIENT_WAREHOUSE:  { label: "Client Warehouse",   className: "bg-green-500/15 text-green-400 border-0" },
  // legacy
  DELIVERED:         { label: "Delivered",          className: "bg-green-500/15 text-green-400 border-0" },
  IN_TRANSIT:        { label: "In Transit",         className: "bg-sky-500/15 text-sky-400 border-0" },
  AT_WAREHOUSE:      { label: "At Warehouse",       className: "bg-amber-400/15 text-amber-400 border-0" },
  AT_FACTORY:        { label: "At Factory",         className: "bg-zinc-700 text-zinc-300 border-0" },
  DELAYED:           { label: "Delayed",            className: "bg-red-500/15 text-red-400 border-0" },
};

// ─── Helpers ───────────────────────────────────────────────────────

function CheckIcon({ passed }: { passed: boolean }) {
  if (passed) return <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />;
  return <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />;
}

function fmt(n: number) { return n.toLocaleString(); }

// ─── Edit LOT Dialog ────────────────────────────────────────────────

function EditLotDialog({ lot, onClose }: { lot: LotImport | null; onClose: () => void }) {
  const { data: partCounts = [], isLoading } = useLotItemCounts(lot?.lot_number ?? null);
  const { data: catalog = [] } = useProductCatalog();
  const allPartNumbers = catalog.map((c) => c.part_number);
  const { data: orders = [] } = useProductionOrders();
  const { data: clients = [] } = useClients();
  const bulkCreate = useBulkCreateManufacturedItems();
  const updateLotImport = useUpdateLotImport();
  const subtractLotItems = useSubtractLotItems();

  const [expanded, setExpanded] = useState<{ part: string; mode: "add" | "subtract" } | null>(null);
  const [inputCount, setInputCount] = useState("");
  const [inputStartSerial, setInputStartSerial] = useState("1");
  const [lastAdded, setLastAdded] = useState<{ partNumber: string; count: number } | null>(null);
  const [showNewPart, setShowNewPart] = useState(false);
  const [newPartNumber, setNewPartNumber] = useState("");
  const [newPartCount, setNewPartCount] = useState("");
  const [newPartStartSerial, setNewPartStartSerial] = useState("1");
  const [selectedOrderId, setSelectedOrderId] = useState<string>(lot?.production_order_id ?? "none");
  const [selectedClientId, setSelectedClientId] = useState<string>(lot?.client_id ?? "none");

  useEffect(() => {
    setSelectedOrderId(lot?.production_order_id ?? "none");
    setSelectedClientId(lot?.client_id ?? "none");
  }, [lot?.id]);

  function openRow(part: string, mode: "add" | "subtract") {
    setExpanded(expanded?.part === part && expanded.mode === mode ? null : { part, mode });
    setInputCount("");
    setInputStartSerial("1");
  }

  function handleAdd(partNumber: string) {
    if (!lot) return;
    const count = parseInt(inputCount, 10);
    const start = parseInt(inputStartSerial, 10);
    if (isNaN(count) || count <= 0 || isNaN(start)) return;
    const end = start + count - 1;
    const pad = Math.max(String(end).length, 3);
    const items: CreateManufacturedItemInput[] = [];
    for (let i = start; i <= end; i++) {
      items.push({ part_number: partNumber, serial_number: String(i).padStart(pad, "0"), lot_number: lot.lot_number, status: "OK", issue: null, box_label: null });
    }
    bulkCreate.mutate(items, {
      onSuccess: () => {
        updateLotImport.mutate({ id: lot.id, updates: { item_count: (lot.item_count ?? 0) + items.length } });
        setLastAdded({ partNumber, count: items.length });
        setExpanded(null);
        setInputCount("");
        setInputStartSerial("1");
      },
    });
  }

  function handleSubtract(partNumber: string) {
    if (!lot) return;
    const count = parseInt(inputCount, 10);
    if (isNaN(count) || count <= 0) return;
    subtractLotItems.mutate({ lotNumber: lot.lot_number, partNumber, count }, {
      onSuccess: (removed) => {
        updateLotImport.mutate({ id: lot.id, updates: { item_count: Math.max(0, (lot.item_count ?? 0) - removed) } });
        setExpanded(null);
        setInputCount("");
        if (lastAdded?.partNumber === partNumber) setLastAdded(null);
      },
    });
  }

  function handleRevert() {
    if (!lot || !lastAdded) return;
    subtractLotItems.mutate({ lotNumber: lot.lot_number, partNumber: lastAdded.partNumber, count: lastAdded.count }, {
      onSuccess: (removed) => {
        updateLotImport.mutate({ id: lot.id, updates: { item_count: Math.max(0, (lot.item_count ?? 0) - removed) } });
        setLastAdded(null);
      },
    });
  }

  function handleAddNew() {
    if (!lot) return;
    const pn = newPartNumber.trim().toUpperCase();
    const count = parseInt(newPartCount, 10);
    const start = parseInt(newPartStartSerial, 10);
    if (!pn || isNaN(count) || count <= 0 || isNaN(start)) return;
    const end = start + count - 1;
    const pad = Math.max(String(end).length, 3);
    const items: CreateManufacturedItemInput[] = [];
    for (let i = start; i <= end; i++) {
      items.push({ part_number: pn, serial_number: String(i).padStart(pad, "0"), lot_number: lot.lot_number, status: "OK", issue: null, box_label: null });
    }
    bulkCreate.mutate(items, {
      onSuccess: () => {
        updateLotImport.mutate({ id: lot.id, updates: { item_count: (lot.item_count ?? 0) + items.length } });
        setLastAdded({ partNumber: pn, count: items.length });
        setShowNewPart(false);
        setNewPartNumber("");
        setNewPartCount("");
        setNewPartStartSerial("1");
      },
    });
  }

  const isPending = bulkCreate.isPending || subtractLotItems.isPending;

  return (
    <Dialog open={!!lot} onOpenChange={(o) => { if (!o) { onClose(); setExpanded(null); setLastAdded(null); setShowNewPart(false); setNewPartNumber(""); setNewPartCount(""); setNewPartStartSerial("1"); } }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Items — {lot?.lot_number}</DialogTitle>
          <p className="text-zinc-500 text-sm">Use + to add or − to remove items per part number.</p>
        </DialogHeader>
        {lastAdded && (
          <div className="flex items-center justify-between bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
            <span className="text-zinc-400">Added <span className="text-zinc-200 font-semibold">{lastAdded.count}</span> × <span className="font-mono text-zinc-200">{lastAdded.partNumber}</span></span>
            <button onClick={handleRevert} disabled={isPending} className="text-amber-400 hover:text-amber-300 font-medium transition-colors disabled:opacity-50">
              Revert
            </button>
          </div>
        )}
        <div className="mt-1">
          {isLoading ? (
            <div className="py-8 text-center text-zinc-500 text-sm animate-pulse">Loading…</div>
          ) : partCounts.length === 0 ? (
            <div className="py-8 text-center text-zinc-600 text-sm">No items found for this LOT.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs text-zinc-500 uppercase tracking-wider pb-2">Part Number</th>
                  <th className="text-right text-xs text-zinc-500 uppercase tracking-wider pb-2 pr-2">Count</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {partCounts.map(({ part_number, count }) => (
                  <React.Fragment key={part_number}>
                    <tr className="group">
                      <td className="py-2.5 font-mono text-zinc-200 text-xs">{part_number}</td>
                      <td className="py-2.5 text-right pr-2 tabular-nums text-zinc-300 font-semibold">{count.toLocaleString()}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => openRow(part_number, "subtract")}
                            className={`p-1 rounded transition-colors ${expanded?.part === part_number && expanded.mode === "subtract" ? "text-red-400 bg-zinc-800" : "text-zinc-600 hover:text-red-400 hover:bg-zinc-800"}`}
                            title={`Subtract items for ${part_number}`}
                          >
                            <span className="text-base leading-none font-bold">−</span>
                          </button>
                          <button
                            onClick={() => openRow(part_number, "add")}
                            className={`p-1 rounded transition-colors ${expanded?.part === part_number && expanded.mode === "add" ? "text-[#16a34a] bg-zinc-800" : "text-zinc-600 hover:text-[#16a34a] hover:bg-zinc-800"}`}
                            title={`Add items for ${part_number}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded?.part === part_number && (
                      <tr>
                        <td colSpan={3} className="pb-3 pt-1">
                          <div className={`rounded-lg p-3 space-y-2 border ${expanded.mode === "add" ? "bg-zinc-800/60 border-zinc-700" : "bg-red-950/20 border-red-900/40"}`}>
                            <p className="text-xs font-medium">
                              {expanded.mode === "add" ? (
                                <span className="text-zinc-400">Add to <span className="font-mono text-zinc-200">{part_number}</span></span>
                              ) : (
                                <span className="text-red-400">Remove last N from <span className="font-mono text-zinc-200">{part_number}</span></span>
                              )}
                            </p>
                            <div className="flex gap-2 items-end">
                              <div className="flex-1 space-y-1">
                                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Count</label>
                                <Input
                                  type="number"
                                  min="1"
                                  placeholder="100"
                                  value={inputCount}
                                  onChange={(e) => setInputCount(e.target.value)}
                                  className="h-7 text-xs bg-zinc-700 border-zinc-600 text-zinc-100"
                                  autoFocus
                                />
                              </div>
                              {expanded.mode === "add" && (
                                <div className="flex-1 space-y-1">
                                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Start Serial</label>
                                  <Input
                                    type="number"
                                    min="1"
                                    placeholder="1"
                                    value={inputStartSerial}
                                    onChange={(e) => setInputStartSerial(e.target.value)}
                                    className="h-7 text-xs bg-zinc-700 border-zinc-600 text-zinc-100"
                                  />
                                </div>
                              )}
                              <Button
                                size="sm"
                                className={`h-7 text-xs shrink-0 ${expanded.mode === "add" ? "bg-[#16a34a] hover:bg-[#15803d] text-white" : "bg-red-700 hover:bg-red-600 text-white"}`}
                                onClick={() => expanded.mode === "add" ? handleAdd(part_number) : handleSubtract(part_number)}
                                disabled={isPending || !inputCount}
                              >
                                {isPending ? "…" : expanded.mode === "add" ? "Add" : "Remove"}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-400 shrink-0" onClick={() => setExpanded(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Add new part number ── */}
        <div className="border-t border-zinc-800 pt-3 mt-1">
          {!showNewPart ? (
            <button
              onClick={() => setShowNewPart(true)}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-[#16a34a] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add new part number
            </button>
          ) : (
            <div className="rounded-lg p-3 space-y-2 bg-zinc-800/60 border border-zinc-700">
              <p className="text-xs font-medium text-zinc-400">New part number</p>
              <div className="space-y-1.5">
                <Select value={newPartNumber} onValueChange={setNewPartNumber}>
                  <SelectTrigger className="h-7 text-xs bg-zinc-700 border-zinc-600 text-zinc-100 font-mono">
                    <SelectValue placeholder="Select part number…" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 max-h-60">
                    {allPartNumbers.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs font-mono text-zinc-200 focus:bg-zinc-700">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Count</label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="140"
                      value={newPartCount}
                      onChange={(e) => setNewPartCount(e.target.value)}
                      className="h-7 text-xs bg-zinc-700 border-zinc-600 text-zinc-100"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Start Serial</label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="1"
                      value={newPartStartSerial}
                      onChange={(e) => setNewPartStartSerial(e.target.value)}
                      className="h-7 text-xs bg-zinc-700 border-zinc-600 text-zinc-100"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs shrink-0 bg-[#16a34a] hover:bg-[#15803d] text-white"
                    onClick={handleAddNew}
                    disabled={isPending || !newPartNumber.trim() || !newPartCount}
                  >
                    {isPending ? "…" : "Add"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-zinc-400 shrink-0"
                    onClick={() => { setShowNewPart(false); setNewPartNumber(""); setNewPartCount(""); setNewPartStartSerial("1"); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Production Order assignment ── */}
        <div className="border-t border-zinc-800 pt-3 mt-1 space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Production Order</label>
          <Select
            value={selectedOrderId}
            onValueChange={(v) => {
              if (!lot) return;
              setSelectedOrderId(v);
              const selectedOrder = orders.find((o) => o.id === v);
              const updates: Parameters<typeof updateLotImport.mutate>[0]["updates"] = {
                production_order_id: v === "none" ? null : v,
              };
              if (v !== "none" && selectedOrder?.client_id) {
                updates.client_id = selectedOrder.client_id;
                setSelectedClientId(selectedOrder.client_id);
              }
              updateLotImport.mutate({ id: lot.id, updates });
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-zinc-800 border-zinc-700 text-zinc-100">
              <SelectValue placeholder="No order assigned" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="none" className="text-xs text-zinc-400 focus:bg-zinc-700">
                No order assigned
              </SelectItem>
              {orders.map((o) => (
                <SelectItem key={o.id} value={o.id} className="text-xs text-zinc-200 focus:bg-zinc-700 font-mono">
                  {o.order_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── Client assignment ── */}
        <div className="border-t border-zinc-800 pt-3 mt-1 space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Client</label>
          <Select
            value={selectedClientId}
            onValueChange={(v) => {
              if (!lot) return;
              setSelectedClientId(v);
              updateLotImport.mutate({ id: lot.id, updates: { client_id: v === "none" ? undefined : v } });
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-zinc-800 border-zinc-700 text-zinc-100">
              <SelectValue placeholder="No client assigned" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="none" className="text-xs text-zinc-400 focus:bg-zinc-700">
                No client assigned
              </SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs text-zinc-200 focus:bg-zinc-700">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ──────────────────────────────────────────────────────────

export default function LotsPage() {
  const { data: lotImports = [] } = useLotImports();
  const lotNumbers = useMemo(() => lotImports.map((l) => l.lot_number).filter(Boolean) as string[], [lotImports]);
  const { data: goodCounts = {} } = useManufacturedLotCounts(lotNumbers);
  const { data: lotLocations = {} } = useLotLocations(lotNumbers);
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
  const updateLotLocation = useUpdateLotItemsLocation();
  const bulkCreate = useBulkCreateManufacturedItems();
  const resolveIssues = useResolveIssues();

  // ── Sorting ──
  type LotSortKey = "lot_number" | "created_at" | "lot_status" | "client" | "good_items" | "location";
  const [lotSortKey, setLotSortKey] = useState<LotSortKey>("created_at");
  const [lotSortDir, setLotSortDir] = useState<"asc" | "desc">("desc");
  function toggleLotSort(col: LotSortKey) {
    if (lotSortKey === col) setLotSortDir(d => d === "asc" ? "desc" : "asc");
    else { setLotSortKey(col); setLotSortDir("asc"); }
  }
  function LotSortIcon({ col }: { col: LotSortKey }) {
    if (lotSortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return lotSortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 text-[#16a34a]" /> : <ArrowDown className="h-3 w-3 ml-1 text-[#16a34a]" />;
  }
  const sortedLots = useMemo(() => {
    const arr = [...lotImports];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (lotSortKey) {
        case "lot_number": {
          const na = parseInt(a.lot_number.replace(/\D/g, "")) || 0;
          const nb = parseInt(b.lot_number.replace(/\D/g, "")) || 0;
          cmp = na - nb;
          break;
        }
        case "created_at":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "lot_status":
          cmp = (a.lot_status ?? "").localeCompare(b.lot_status ?? "");
          break;
        case "client":
          cmp = (a.clients?.name ?? "").localeCompare(b.clients?.name ?? "");
          break;
        case "good_items":
          cmp = (goodCounts[a.lot_number] ?? 0) - (goodCounts[b.lot_number] ?? 0);
          break;
        case "location":
          cmp = (lotLocations[a.lot_number] ?? "").localeCompare(lotLocations[b.lot_number] ?? "");
          break;
      }
      return lotSortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [lotImports, lotSortKey, lotSortDir, goodCounts, lotLocations]);

  // ── Edit LOT items state ──
  const [editLot, setEditLot] = useState<LotImport | null>(null);

  // ── Location edit state ──
  const [locationEditLot, setLocationEditLot] = useState<LotImport | null>(null);
  const [locationEditValue, setLocationEditValue] = useState<ManufacturedItemLocation>("FACTORY");

  function openLocationEdit(lot: LotImport) {
    setLocationEditLot(lot);
    setLocationEditValue((lotLocations[lot.lot_number] as ManufacturedItemLocation) ?? "FACTORY");
  }

  function handleSaveLocation() {
    if (!locationEditLot) return;
    updateLotLocation.mutate(
      { lotNumber: locationEditLot.lot_number, location: locationEditValue },
      { onSuccess: () => setLocationEditLot(null) }
    );
  }

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
  const [crossRefChecks, setCrossRefChecks] = useState<CrossRefRow[] | null>(null);
  const [duplicates, setDuplicates] = useState<{ part_number: string; serial_number: string; lot_number: string | null }[] | null>(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [snError, setSnError] = useState("");
  const [snFile, setSnFile] = useState<File | null>(null);
  const [snDragging, setSnDragging] = useState(false);
  const snFileRef = useRef<HTMLInputElement>(null);
  const gbxRef = useRef<HTMLInputElement>(null);
  const [gbxDragging, setGbxDragging] = useState(false);

  // Issues overview
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const { data: pendingDbIssues = [] } = useOrderPendingIssues(
    importOrderId !== "none" ? importOrderId : "",
    importOrderId !== "none",
  );
  function toggleExpandIssue(name: string) {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

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
          const raw = parseCSVLot(text, importLot.trim(), issueDefinitions);
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

    // Only save PL items (above the blank separator) — exception items are shown
    // in the import preview but not saved to manufactured_items. Pre-blank items
    // are always OK so no status filter needed here.
    const cleanItems = parsedItems.filter((item) => !item._isException);

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
      item_count: cleanItems.length,
      ...(clientId && { client_id: clientId }),
      ...(orderId && { production_order_id: orderId }),
      lot_status: "AT_FACTORY",
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const itemsWithClient = cleanItems.map(({ _isException, ...item }) => ({
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
        <div className="flex items-center gap-2">
          <Link href="/tools/file-converter">
            <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 gap-2">
              <Wrench className="h-4 w-4" />
              LOT-TOOL
            </Button>
          </Link>
          <Button variant="outline" onClick={openImport} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Import LOT
          </Button>
        </div>
      </div>

      {/* Lots Table */}
      <div className="rounded-lg border border-zinc-800 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-500 w-12">#</TableHead>
              <TableHead className="text-zinc-500">
                <button onClick={() => toggleLotSort("lot_number")} className="flex items-center hover:text-zinc-200 transition-colors">
                  LOT Name <LotSortIcon col="lot_number" />
                </button>
              </TableHead>
              <TableHead className="text-zinc-500">
                <button onClick={() => toggleLotSort("created_at")} className="flex items-center hover:text-zinc-200 transition-colors">
                  Date Created <LotSortIcon col="created_at" />
                </button>
              </TableHead>
              <TableHead className="text-zinc-500 text-center">PL Approved</TableHead>
              <TableHead className="text-zinc-500 text-center">Serial Approved</TableHead>
              <TableHead className="text-zinc-500">
                <button onClick={() => toggleLotSort("lot_status")} className="flex items-center hover:text-zinc-200 transition-colors">
                  Status <LotSortIcon col="lot_status" />
                </button>
              </TableHead>
              <TableHead className="text-zinc-500">Production Order</TableHead>
              <TableHead className="text-zinc-500">
                <button onClick={() => toggleLotSort("client")} className="flex items-center hover:text-zinc-200 transition-colors">
                  Client <LotSortIcon col="client" />
                </button>
              </TableHead>
              <TableHead className="text-zinc-500">
                <button onClick={() => toggleLotSort("location")} className="flex items-center hover:text-zinc-200 transition-colors">
                  Location <LotSortIcon col="location" />
                </button>
              </TableHead>
              <TableHead className="text-zinc-500 text-right">
                <button onClick={() => toggleLotSort("good_items")} className="flex items-center justify-end hover:text-zinc-200 transition-colors w-full">
                  Good Items <LotSortIcon col="good_items" />
                </button>
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedLots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-zinc-500 py-12">
                  No lots yet. Click &quot;Import LOT&quot; to get started.
                </TableCell>
              </TableRow>
            ) : sortedLots.map((lot, i) => {
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
                    <Badge className={`${LOT_STATUS_CONFIG[lotStatus]?.className ?? "bg-zinc-700 text-zinc-300 border-0"}`}>
                      {LOT_STATUS_CONFIG[lotStatus]?.label ?? lotStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-400 text-sm font-mono">{lot.production_orders?.order_number ?? <span className="text-zinc-600">—</span>}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{lot.clients?.name ?? <span className="text-zinc-600">—</span>}</TableCell>
                  <TableCell>
                    {(() => {
                      const loc = lotLocations[lot.lot_number];
                      if (!loc) return <span className="text-zinc-600 text-xs">—</span>;
                      const cfg = LOCATION_CONFIG[loc] ?? { label: loc, className: "bg-zinc-700 text-zinc-300" };
                      return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.className}`}>{cfg.label}</span>;
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    {(() => {
                      const good = goodCounts[lot.lot_number];
                      const raw = lot.item_count ?? 0;
                      const hasDiscrepancy = good !== undefined && good !== raw;
                      return (
                        <div className="flex flex-col items-end gap-0">
                          <span className="text-sm font-semibold tabular-nums text-zinc-200">{good !== undefined ? fmt(good) : fmt(raw)}</span>
                          {hasDiscrepancy && (
                            <span className="text-[10px] text-zinc-600 tabular-nums" title="Raw import count (includes items with issues/bad status)">
                              {fmt(raw)} imported
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditLot(lot)}
                        className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                        title={`Edit items in LOT ${lot.lot_number}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => openLocationEdit(lot)}
                        className="p-1 text-zinc-600 hover:text-blue-400 transition-colors"
                        title={`Edit location for LOT ${lot.lot_number}`}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                      </button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className="p-1 text-zinc-600 hover:text-yellow-400 transition-colors"
                            title={`Change status for LOT ${lot.lot_number}`}
                          >
                            <Tag className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="bg-zinc-900 border-zinc-700 p-1.5 w-48" align="end">
                          <p className="text-zinc-500 text-[10px] uppercase tracking-wider px-2 py-1">Set Status</p>
                          {ALL_LOT_STATUSES.map((s) => (
                            <button
                              key={s}
                              onClick={() => handleStatusChange(lot, s)}
                              className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                                lotStatus === s ? "bg-zinc-800" : "hover:bg-zinc-800/60"
                              }`}
                            >
                              <Badge className={`${LOT_STATUS_CONFIG[s].className} pointer-events-none`}>
                                {LOT_STATUS_CONFIG[s].label}
                              </Badge>
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                      <button
                        onClick={() => handleDeleteLot(lot)}
                        disabled={deleteLotImport.isPending}
                        className="p-1 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
                        title={`Delete LOT ${lot.lot_number} and all items`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Edit LOT Items Dialog ── */}
      <EditLotDialog lot={editLot} onClose={() => setEditLot(null)} />

      {/* ── Location Edit Dialog ── */}
      <Dialog open={!!locationEditLot} onOpenChange={(o) => { if (!o) setLocationEditLot(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Edit Location — {locationEditLot?.lot_number}</DialogTitle>
            <p className="text-zinc-500 text-sm">Updates the location of all manufactured items in this LOT.</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Location</Label>
              <Select value={locationEditValue} onValueChange={(v) => setLocationEditValue(v as ManufacturedItemLocation)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {LOCATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-zinc-100">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setLocationEditLot(null)} className="text-zinc-400">Cancel</Button>
              <Button size="sm" onClick={handleSaveLocation} disabled={updateLotLocation.isPending} className="bg-[#16a34a] hover:bg-[#15803d] text-white">
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                {crossRefChecks && crossRefChecks.every(c => c.fulfilled) && <CheckCircle2 className="h-4 w-4 text-green-400" />}
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

              {/* Box Breakdown */}
              {parsedItems && parsedItems.length > 0 && (() => {
                // Group clean (non-exception) items by part → box_label → serials
                const byPart: Record<string, Record<string, string[]>> = {};
                const exceptionByPart: Record<string, number> = {};
                for (const item of parsedItems) {
                  const pn = item.part_number;
                  if (item._isException) {
                    exceptionByPart[pn] = (exceptionByPart[pn] ?? 0) + 1;
                    continue;
                  }
                  const box = item.box_label ?? "—";
                  if (!byPart[pn]) byPart[pn] = {};
                  if (!byPart[pn][box]) byPart[pn][box] = [];
                  byPart[pn][box].push(item.serial_number);
                }
                const parts = Object.keys(byPart).sort();
                if (parts.length === 0) return null;
                return (
                  <div className="bg-zinc-800/60 rounded-lg p-3 space-y-3">
                    <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Box Breakdown</p>
                    {parts.map(pn => {
                      const boxes = byPart[pn];
                      const getBoxNum = (s: string) => parseInt(s.match(/(\d+)\/\d+/)?.[1] ?? "0") || parseInt(s) || 0;
                      const sortedBoxes = Object.entries(boxes).sort((a, b) => getBoxNum(a[0]) - getBoxNum(b[0]));
                      const totalClean = sortedBoxes.reduce((s, [, sns]) => s + sns.length, 0);
                      const exceptions = exceptionByPart[pn] ?? 0;
                      return (
                        <div key={pn}>
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-zinc-200 text-xs font-mono font-semibold">{pn}</span>
                            <span className="text-zinc-500 text-[10px]">{totalClean} items · {sortedBoxes.length} boxes{exceptions > 0 ? ` · ${exceptions} excluded` : ""}</span>
                          </div>
                          <div className="space-y-0.5 pl-2 max-h-48 overflow-y-auto">
                            {sortedBoxes.map(([box, sns]) => {
                              const nums = sns.map(s => parseInt(s, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b);
                              const min = nums[0];
                              const max = nums[nums.length - 1];
                              const isContiguous = max - min + 1 === nums.length;
                              return (
                                <div key={box} className="grid text-[10px] font-mono" style={{ gridTemplateColumns: "7rem 3.5rem 1fr" }}>
                                  <span className="text-amber-400">{box}</span>
                                  <span className="text-zinc-500">{sns.length} pcs</span>
                                  <span className="text-zinc-600">
                                    {isContiguous ? `${min}–${max}` : `${min}–${max} (${nums.length})`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

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
                <div className="bg-zinc-800/60 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Cross-Reference vs Packing List</p>
                    {crossRefChecks.every(c => c.fulfilled)
                      ? <span className="text-xs text-green-400 font-medium flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> All fulfilled</span>
                      : <span className="text-xs text-red-400 font-medium">× {crossRefChecks.filter(c => !c.fulfilled).length} failed</span>
                    }
                  </div>
                  {crossRefChecks.map((row, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <CheckIcon passed={row.fulfilled} />
                        <span className="text-zinc-200 text-xs font-mono font-semibold">{row.partNumber}</span>
                      </div>
                      <div className="ml-6 grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-500 uppercase tracking-wide">Parsed</span>
                          <span className="text-zinc-300 font-medium">{row.parsed}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-500 uppercase tracking-wide">PL Fulfill</span>
                          <span className={`font-semibold ${row.fulfilled ? "text-green-400" : "text-red-400"}`}>
                            {row.clean}/{row.plExpected}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-500 uppercase tracking-wide">Issues</span>
                          <span className={`font-semibold ${row.issues > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                            {row.issues}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Issues Overview */}
            {(() => {
              const newIssueItems = (parsedItems ?? []).filter((i) => i.issue);
              const allIssueNames = Array.from(new Set([
                ...pendingDbIssues.map((i) => i.issue!),
                ...newIssueItems.map((i) => i.issue!),
              ])).sort();
              if (allIssueNames.length === 0) return null;
              const totalAffected = pendingDbIssues.length + newIssueItems.length;
              return (
                <>
                  <Separator className="bg-zinc-800" />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Issues Overview</p>
                      <span className="text-amber-400 text-xs flex items-center gap-1 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {totalAffected} items affected
                      </span>
                    </div>
                    <div className="space-y-1">
                      {allIssueNames.map((issueName) => {
                        const dbItems = pendingDbIssues.filter((i) => i.issue === issueName);
                        const newItems = newIssueItems.filter((i) => i.issue === issueName);
                        const total = dbItems.length + newItems.length;
                        const expanded = expandedIssues.has(issueName);
                        // Group DB items by part_number for sub-rows
                        const byPart = dbItems.reduce((acc, item) => {
                          if (!acc[item.part_number]) acc[item.part_number] = [];
                          acc[item.part_number].push(item);
                          return acc;
                        }, {} as Record<string, typeof dbItems>);
                        // Also include new (not-yet-imported) items by part
                        const newByPart = newItems.reduce((acc, item) => {
                          if (!acc[item.part_number]) acc[item.part_number] = [];
                          acc[item.part_number].push(item);
                          return acc;
                        }, {} as Record<string, typeof newItems>);
                        const allParts = Array.from(new Set([...Object.keys(byPart), ...Object.keys(newByPart)])).sort();
                        return (
                          <div key={issueName} className="border border-zinc-700 rounded-lg overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/60">
                              <button
                                type="button"
                                onClick={() => toggleExpandIssue(issueName)}
                                className="text-zinc-500 hover:text-zinc-300 shrink-0"
                              >
                                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                              <span className="text-red-400 font-semibold text-sm flex-1 uppercase">{issueName}</span>
                              <span className="text-zinc-500 text-xs mr-2">({total})</span>
                              {dbItems.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-xs px-2 border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                                  disabled={resolveIssues.isPending}
                                  onClick={() => resolveIssues.mutate(dbItems.map((i) => i.id))}
                                >
                                  Resolve All
                                </Button>
                              )}
                              {dbItems.length === 0 && newItems.length > 0 && (
                                <span className="text-xs text-amber-500/70 italic">this import</span>
                              )}
                            </div>
                            {expanded && allParts.map((part) => {
                              const dbPartItems = byPart[part] ?? [];
                              const newPartItems = newByPart[part] ?? [];
                              const partTotal = dbPartItems.length + newPartItems.length;
                              return (
                                <div key={part} className="flex items-center gap-2 px-3 py-1.5 border-t border-zinc-700/50 bg-zinc-800/20">
                                  <ChevronRight className="h-3 w-3 text-zinc-600 ml-5 shrink-0" />
                                  <span className="font-mono text-zinc-300 text-xs flex-1">{part}</span>
                                  <span className="text-zinc-500 text-xs mr-2">({partTotal})</span>
                                  {dbPartItems.length > 0 && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-xs px-2 border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                                      disabled={resolveIssues.isPending}
                                      onClick={() => resolveIssues.mutate(dbPartItems.map((i) => i.id))}
                                    >
                                      Resolve
                                    </Button>
                                  )}
                                  {dbPartItems.length === 0 && (
                                    <span className="text-xs text-amber-500/70 italic text-right">new</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setImportOpen(false)}>Cancel</Button>
              {(() => {
                const cleanCount = parsedItems ? parsedItems.filter(i => !i._isException).length : 0;
                const issueCount = parsedItems ? parsedItems.filter(i => i._isException).length : 0;
                return (
                  <Button disabled={!parsedItems || isImporting} onClick={handleImportConfirm} className="flex-1 bg-[#16a34a] hover:bg-[#15803d] text-white">
                    {isImporting ? "Saving..." : parsedItems
                      ? `Import ${fmt(cleanCount)} PL Items${issueCount > 0 ? ` (${fmt(issueCount)} with issues excluded)` : ""}`
                      : "Import"}
                  </Button>
                );
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
