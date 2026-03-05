"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  Upload, CheckCircle2, XCircle, Download, FileText, FileSpreadsheet, FileCode2, Trash2, Copy,
  ChevronRight, ChevronDown, AlertTriangle, PackagePlus, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ManufacturedItemStatus, CreateManufacturedItemInput, IssueDefinition } from "@/lib/types/database";
import { useIssueDefinitions } from "@/hooks/use-issue-definitions";
import { useProductionOrders } from "@/hooks/use-production";
import { useClients } from "@/hooks/use-clients";
import { createClient } from "@/lib/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
interface CrossRefRow {
  partNumber: string;
  parsed: number;     // total items found in Excel column
  clean: number;      // items with no issue (packed)
  issues: number;     // items with issue flag (kept at factory, not packed)
  plExpected: number; // qty stated in packing list
  fulfilled: boolean; // clean >= plExpected (PL is satisfied)
  extra: number;      // clean - plExpected when clean > plExpected (over-delivery)
}
type ParsedItem = CreateManufacturedItemInput & { _isException?: boolean; _boxNum?: number };
interface PartSummary { added: number; bad: number; manual: number; extra: number }
interface PartRangeConfig {
  id: string;
  partNumber: string;
  cellRange: string;   // e.g. "A3:A182"
  type: "auto" | "individual" | "range" | "count";
}

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

  // Fix stale/truncated !ref: some Excel files have a <dimension> element that
  // doesn't cover all data rows. Expand !ref to the actual cell range so
  // sheet_to_json returns every row.
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
      log("EXCEL", `Expanded !ref from ${origRef} to ${newRef} (sheet had cells beyond declared range)`, "warn");
    }
  }

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null });
  if (rows.length === 0) return [];

  log("EXCEL", `Sheet "${wb.SheetNames[0]}" — ${rows.length} total rows (ref: ${ws['!ref']})`);
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
      return typeof v === "string" && (v.includes("-") || v.includes("_")) && /^[A-Za-z]/.test(v) && !v.includes(" ") && v.length > 5;
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
  if (separatorRow > 0) {
    log("EXCEL", `Separator row at index ${separatorRow} (row ${separatorRow + 1}) — exception section follows`);
    // Debug: show 5 rows before and 20 rows after separator (even cols = serial, odd cols = box/comment)
    const debugStart = Math.max(dataStart, separatorRow - 5);
    const debugEnd = Math.min(rows.length, separatorRow + 21);
    // Interleave even+odd columns for col A and col B only (MB1 + adjacent)
    for (let dr = debugStart; dr < debugEnd; dr++) {
      const row = rows[dr] as (string | number | null)[];
      const colA = row[0] != null ? String(row[0]) : "—";
      const colB = row[1] != null ? String(row[1]) : "—";
      const marker = dr === separatorRow ? " ← SEPARATOR" : dr < separatorRow ? "" : " [exception]";
      log("EXCEL", `  row ${dr + 1}: A=${colA} B=${colB}${marker}`);
    }
  } else log("EXCEL", "No separator row found — processing all rows");

  // Direct worksheet cell count for col A — bypasses sheet_to_json to find hidden/text-format cells
  const colAEnd = separatorRow > 0 ? separatorRow : rows.length;
  let directColACount = 0;
  const directColAValues: string[] = [];
  for (let r = dataStart; r < colAEnd; r++) {
    const cellAddr = XLSX.utils.encode_cell({ r, c: 0 });
    const cell = (ws as Record<string, {v?: unknown; w?: string; t?: string}>)[cellAddr];
    if (cell?.v != null && cell.v !== "") { directColACount++; }
    else if (cell?.w && cell.w.trim() !== "") {
      directColACount++;
      directColAValues.push(`row${r+1}:w="${cell.w}"`);
    }
  }
  const arrayColACount = (rows.slice(dataStart, colAEnd) as (string|number|null)[][]).filter(r => r[0] != null && r[0] !== "").length;
  log("EXCEL", `Col A before separator: ${directColACount} cells (direct ws), ${arrayColACount} cells (array) — ${directColACount - arrayColACount} discrepancy`);
  if (directColAValues.length > 0) log("EXCEL", `  w-only cells: ${directColAValues.join(", ")}`, "warn");

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

  // Box number map: odd adjacent columns contain box numbers (numeric or string int) before blank separator
  // Also expand merged cells just like colComments does
  const colBoxNums = new Map<number, Map<number, number>>();
  for (const merge of merges) {
    if (merge.s.c % 2 !== 1) continue;
    const addr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const cell = ws[addr];
    if (cell?.v == null) continue;
    let numVal: number | null = null;
    if (typeof cell.v === "number") numVal = Math.round(cell.v);
    else if (typeof cell.v === "string" && /^\d+$/.test(cell.v.trim())) numVal = parseInt(cell.v.trim(), 10);
    if (numVal == null || numVal <= 0 || numVal > 9999) continue;
    if (!colBoxNums.has(merge.s.c)) colBoxNums.set(merge.s.c, new Map());
    const colMap = colBoxNums.get(merge.s.c)!;
    for (let mr = merge.s.r; mr <= merge.e.r; mr++) colMap.set(mr, numVal);
  }
  for (const key of Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k))) {
    const { r, c } = XLSX.utils.decode_cell(key);
    if (c % 2 !== 1) continue;
    const cell = ws[key];
    if (cell?.v == null) continue;
    let numVal: number | null = null;
    if (typeof cell.v === "number") numVal = Math.round(cell.v);
    else if (typeof cell.v === "string" && /^\d+$/.test(cell.v.trim())) numVal = parseInt(cell.v.trim(), 10);
    if (numVal == null || numVal <= 0 || numVal > 9999) continue;
    if (!colBoxNums.has(c)) colBoxNums.set(c, new Map());
    if (!colBoxNums.get(c)!.has(r)) colBoxNums.get(c)!.set(r, numVal);
  }
  const totalBoxNumCells = [...colBoxNums.values()].reduce((s, m) => s + m.size, 0);
  if (totalBoxNumCells > 0) log("EXCEL", `Found ${totalBoxNumCells} box number cells in adjacent columns`);
  else log("EXCEL", "No box numbers found in adjacent columns — will use DOCX positional fallback", "warn");

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
        items.push({ part_number: comp.partNumber, serial_number: String(i).padStart(pad, "0"), lot_number: lotNumber, status: "OK" });
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
          items.push({ part_number: comp.partNumber, serial_number: sn, lot_number: lotNumber, status: "OK" });
        }
      }
      log("EXCEL", `  ${colLetter} ${comp.partNumber}: range → ${count} items`);
    } else {
      // Use global separator row (all columns blank) — NOT per-column blank cells.
      // A single blank cell in this column (between boxes) must NOT trigger exception mode.
      let packed = 0, exception = 0;
      let commentsFound = 0, issuesMatched = 0;
      let currentBoxNum: number | null = null;
      for (let r = dataStart; r < rows.length; r++) {
        let val: string | number | null = (rows[r] as (string | number | null)[])[comp.col];
        // Fallback: sheet_to_json returns null for text-formatted cells (cells formatted as Text before entry).
        // Read the raw worksheet cell's `w` (formatted text) or `v` field directly.
        if (val == null || val === "") {
          const cellAddr = XLSX.utils.encode_cell({ r, c: comp.col });
          const rawCell = ws[cellAddr];
          if (rawCell?.w && /^\d+$/.test(rawCell.w.trim())) {
            val = parseInt(rawCell.w.trim(), 10);
            log("EXCEL", `    row ${r + 1}: recovered text-cell value ${val} from cell ${cellAddr}`, "warn");
          } else if (rawCell?.v != null) {
            val = rawCell.v as string | number;
          }
        }
        if (val == null || val === "") continue; // skip blank cells, do NOT flip to exception
        const rawStr = val.toString().trim();
        // Strip invisible Unicode chars (zero-width space, BOM, NBSP, etc.) that may be pasted from external sources
        const strVal = rawStr.replace(/[\u200b\u200c\u200d\ufeff\u00a0\u2028\u2029]/g, '').trim();
        if (!strVal) continue;
        if (!(typeof val === "number" || /^\d+$/.test(strVal))) continue;
        const isException = separatorRow > 0 && r >= separatorRow;
        // Carry-forward box number from adjacent odd column (only before global separator)
        const boxNumAtRow = colBoxNums.get(comp.col + 1)?.get(r);
        // Update carry-forward box number for both pre-blank AND exception items that have explicit box nums
        if (boxNumAtRow != null) currentBoxNum = boxNumAtRow;
        const rawComment = colComments.get(comp.col + 1)?.get(r) ?? null;
        // Pure numeric strings in adjacent column are box numbers, NOT issue comments.
        // e.g. "15" in col B for an exception row = box 15 label, not an issue.
        const adjComment = (rawComment && !/^\d+$/.test(rawComment.trim())) ? rawComment : null;
        let issue: string | null = null;
        if (adjComment) {
          commentsFound++;
          issue = matchIssue(adjComment, issueDefs);
          if (issue) {
            issuesMatched++;
            log("EXCEL", `    SN ${strVal} — comment: "${adjComment}" → matched "${issue}"`, "warn");
          } else {
            // Unmatched comment: use raw comment text as issue name
            issue = adjComment;
            if (issueDefs.length > 0) log("EXCEL", `    SN ${strVal} — comment: "${adjComment}" → no definition match, using raw`);
          }
        }
        // Pre-blank: always carry-forward box num.
        // Exception with NO comment: still belongs to last box (completes the box), carry-forward.
        // Exception WITH comment: defective/held, no box assignment.
        const _boxNum = (!isException || !adjComment) && currentBoxNum != null ? currentBoxNum : undefined;
        // Exception items with no comment and a valid box num are physically packed — treat as packed
        const effectivelyPacked = !isException || (!adjComment && _boxNum != null);
        items.push({ part_number: comp.partNumber, serial_number: strVal, lot_number: lotNumber, status: "OK", issue, _isException: effectivelyPacked ? undefined : (isException || undefined), _boxNum });
        if (!effectivelyPacked) exception++; else packed++;
      }
      const commentInfo = commentsFound > 0 ? ` | ${commentsFound} comments, ${issuesMatched} matched` : " | no adjacent comments";
      log("EXCEL", `  ${colLetter} ${comp.partNumber}: ${packed} packed, ${exception} exception${commentInfo}`);
    }
  }

  const totals = items.reduce((acc, i) => { const s = i.status ?? "OK"; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const issueCount = items.filter(i => i.issue).length;
  const issuesSummary = issueCount > 0 ? ` | ${issueCount} items with issues` : " | 0 issues matched";
  log("EXCEL", `Done — ${Object.entries(totals).map(([s, n]) => `${n} ${s}`).join(", ")}${issuesSummary}`, "success");
  return items;
}

// ─── Range-based Excel Parser ─────────────────────────────────────────────────

function decodeCellRange(range: string): { col: number; startRow: number; endRow: number } | null {
  const m = range.trim().toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) return null;
  const c1 = XLSX.utils.decode_col(m[1]);
  const c2 = XLSX.utils.decode_col(m[3]);
  if (c1 !== c2) return null;
  return { col: c1, startRow: parseInt(m[2]) - 1, endRow: parseInt(m[4]) - 1 };
}

function parseExcelWithRanges(
  buffer: ArrayBuffer,
  lotNumber: string,
  configs: PartRangeConfig[],
  issueDefs: IssueDefinition[],
  log: LogFn,
  startSerials: Record<string, number> = {},
): ParsedItem[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null });
  log("EXCEL", `Sheet "${wb.SheetNames[0]}" — ${rows.length} total rows`);
  if (issueDefs.length === 0) log("EXCEL", "No issue definitions loaded", "warn");

  const merges: XLSX.Range[] = ((ws as { '!merges'?: XLSX.Range[] })['!merges']) ?? [];

  // Build box number map from adjacent odd columns (merged + standalone cells)
  const colBoxNums = new Map<number, Map<number, number>>();
  const addBoxNum = (c: number, r: number, v: unknown) => {
    let n: number | null = null;
    if (typeof v === "number") n = Math.round(v);
    else if (typeof v === "string" && /^\d+$/.test(v.trim())) n = parseInt(v.trim(), 10);
    if (n == null || n <= 0 || n > 9999) return;
    if (!colBoxNums.has(c)) colBoxNums.set(c, new Map());
    if (!colBoxNums.get(c)!.has(r)) colBoxNums.get(c)!.set(r, n);
  };
  for (const merge of merges) {
    if (merge.s.c % 2 !== 1) continue;
    const cell = ws[XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c })];
    if (cell?.v == null) continue;
    for (let mr = merge.s.r; mr <= merge.e.r; mr++) addBoxNum(merge.s.c, mr, cell.v);
  }
  for (const key of Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k))) {
    const { r, c } = XLSX.utils.decode_cell(key);
    if (c % 2 !== 1) continue;
    addBoxNum(c, r, ws[key]?.v);
  }

  // Build issue comment map from adjacent odd columns (string values only)
  const colComments = new Map<number, Map<number, string>>();
  for (const merge of merges) {
    if (merge.s.c % 2 !== 1) continue;
    const cell = ws[XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c })];
    if (!cell?.v || typeof cell.v !== "string") continue;
    if (!colComments.has(merge.s.c)) colComments.set(merge.s.c, new Map());
    for (let mr = merge.s.r; mr <= merge.e.r; mr++) colComments.get(merge.s.c)!.set(mr, cell.v);
  }
  for (const key of Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k))) {
    const { r, c } = XLSX.utils.decode_cell(key);
    if (c % 2 !== 1) continue;
    const cell = ws[key];
    if (!cell?.v || typeof cell.v !== "string") continue;
    if (!colComments.has(c)) colComments.set(c, new Map());
    if (!colComments.get(c)!.has(r)) colComments.get(c)!.set(r, cell.v);
  }

  // Helper: read a serial value from a row/col with text-cell fallback
  const readSerial = (r: number, c: number): string | null => {
    let val: string | number | null = (rows[r] as (string | number | null)[])[c];
    if (val == null || val === "") {
      const rawCell = ws[XLSX.utils.encode_cell({ r, c })];
      if (rawCell?.w && /^\d+$/.test(rawCell.w.trim())) val = parseInt(rawCell.w.trim(), 10);
      else if (rawCell?.v != null) val = rawCell.v as string | number;
    }
    if (val == null || val === "") return null;
    const strVal = val.toString().trim().replace(/[\u200b\u200c\u200d\ufeff\u00a0\u2028\u2029]/g, "").trim();
    if (!strVal || !(typeof val === "number" || /^\d+$/.test(strVal))) return null;
    return strVal;
  };

  const items: ParsedItem[] = [];

  for (const config of configs) {
    if (!config.partNumber || !config.cellRange.trim()) continue;
    const decoded = decodeCellRange(config.cellRange);
    if (!decoded) { log("EXCEL", `Invalid range "${config.cellRange}" — skipping ${config.partNumber}`, "error"); continue; }
    const { col, startRow, endRow } = decoded;
    const colLetter = XLSX.utils.encode_col(col);

    let isRange = false, isQuantity = false;
    if (config.type === "auto") {
      isRange = detectIsRange(rows, col, startRow);
      isQuantity = !isRange && detectIsQuantity(rows, col, startRow);
    } else {
      isRange = config.type === "range";
      isQuantity = config.type === "count";
    }
    const modeStr = isQuantity ? "count" : isRange ? "range" : "individual";
    log("EXCEL", `  Col ${colLetter} ${config.partNumber} [${modeStr}] packed rows ${startRow + 1}–${endRow + 1}`);

    if (isQuantity) {
      let totalQty = 0;
      const batches: number[] = [];
      for (let r = startRow; r <= endRow; r++) {
        const val = (rows[r] as (string | number | null)[])[col];
        if (val == null || val === "") continue;
        const n = typeof val === "number" ? val : parseInt(val.toString(), 10);
        if (!isNaN(n) && n > 0) { batches.push(n); totalQty += n; }
      }
      const firstSerial = (startSerials[config.partNumber] ?? 0) + 1;
      const lastSerial = firstSerial + totalQty - 1;
      const pad = Math.max(String(lastSerial).length, 3);
      for (let i = firstSerial; i <= lastSerial; i++) {
        items.push({ part_number: config.partNumber, serial_number: String(i).padStart(pad, "0"), lot_number: lotNumber, status: "OK", issue: null });
      }
      if (firstSerial > 1) log("EXCEL", `    → ${batches.join("+")}=${totalQty} packed items (serials ${firstSerial}–${lastSerial}, continuing from existing)`);
      else log("EXCEL", `    → ${batches.join("+")}=${totalQty} packed items (serials ${firstSerial}–${lastSerial})`);
    } else if (isRange) {
      let count = 0;
      for (let r = startRow; r <= endRow; r++) {
        const val = (rows[r] as (string | number | null)[])[col];
        if (val == null || val === "") continue;
        const strVal = val.toString().trim();
        if (!strVal.includes("-")) continue;
        const expanded = expandRange(strVal);
        count += expanded.length;
        for (const sn of expanded) items.push({ part_number: config.partNumber, serial_number: sn, lot_number: lotNumber, status: "OK", issue: null });
      }
      log("EXCEL", `    → ${count} packed items`);
    } else {
      // Packed items (inside user-specified range)
      let packed = 0, currentBoxNum: number | null = null;
      for (let r = startRow; r <= endRow; r++) {
        const strVal = readSerial(r, col);
        if (!strVal) continue;
        const boxNumAtRow = colBoxNums.get(col + 1)?.get(r);
        if (boxNumAtRow != null) currentBoxNum = boxNumAtRow;
        items.push({ part_number: config.partNumber, serial_number: strVal, lot_number: lotNumber, status: "OK", issue: null, _boxNum: currentBoxNum ?? undefined });
        packed++;
      }

      // Exception items (rows after endRow in same column, with adjacent comments)
      let exceptionParsed = 0;
      for (let r = endRow + 1; r < rows.length; r++) {
        const strVal = readSerial(r, col);
        if (!strVal) continue;
        const rawComment = colComments.get(col + 1)?.get(r) ?? null;
        const adjComment = (rawComment && !/^\d+$/.test(rawComment.trim())) ? rawComment : null;
        // "taken by you" → MANUAL status
        const status: ManufacturedItemStatus = (adjComment && /taken\s+by\s+you/i.test(adjComment)) ? "MANUAL" : "OK";
        const issue = adjComment ? (matchIssue(adjComment, issueDefs) ?? adjComment) : null;
        const boxNumAtRow = colBoxNums.get(col + 1)?.get(r);
        if (boxNumAtRow != null) currentBoxNum = boxNumAtRow;
        const _boxNum = !adjComment && currentBoxNum != null ? currentBoxNum : undefined;
        items.push({ part_number: config.partNumber, serial_number: strVal, lot_number: lotNumber, status, issue, _isException: true, _boxNum });
        exceptionParsed++;
      }

      log("EXCEL", `    → ${packed} packed${exceptionParsed > 0 ? `, ${exceptionParsed} exception` : ""}`);
    }
  }

  const issueCount = items.filter(i => i.issue).length;
  log("EXCEL", `Done — ${items.length} total items${issueCount > 0 ? `, ${issueCount} with issues` : ""}`, "success");
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
    let created = 0, manual = 0;
    if (col.isRange) {
      for (let r = 1; r < normalEnd; r++) {
        const val = rows[r][col.col]?.trim();
        if (!val || !val.includes("-")) continue;
        for (const sn of expandRange(val)) {
          items.push({ part_number: col.partNumber, serial_number: sn, lot_number: lotNumber, status: "OK" });
          created++;
        }
      }
    } else {
      for (let r = 1; r < rows.length; r++) {
        const val = rows[r][col.col]?.trim();
        if (!val) continue; // skip blanks — all rows in column are products
        if (!/^\d+(\.\d+)?$/.test(val)) continue;
        const sn = val.includes(".") ? val.split(".")[0] : val;
        const note = (rows[r][col.col + 1] ?? "").trim().toLowerCase();
        if (note === "missing") continue;
        const status: ManufacturedItemStatus = note.includes("taken by you") ? "MANUAL" : "OK";
        items.push({ part_number: col.partNumber, serial_number: sn, lot_number: lotNumber, status });
        if (status === "OK") created++; else manual++;
      }
    }
    log("CSV", `  ${col.partNumber}: ${created} OK${manual > 0 ? `, ${manual} MANUAL` : ""}`);
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
        if (col.isRange && sn.includes("-")) {
          const status: ManufacturedItemStatus = note.includes("taken by you") ? "MANUAL" : "OK";
          for (const expanded of expandRange(sn)) { items.push({ part_number: col.partNumber, serial_number: expanded, lot_number: lotNumber, status }); excCount++; }
        } else {
          // Individual cols are already processed in the main loop above; skip to avoid duplicates
          continue;
        }
      }
    }
    if (excCount > 0) log("CSV", `Exception section: ${excCount} additional items`, "warn");
  }

  const totals = items.reduce((acc, i) => { const s = i.status ?? "OK"; acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Record<string, number>);
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

    // Prefer Excel-sourced box numbers (_boxNum) over positional DOCX assignment
    const hasExcelBoxNums = partItems.some(i => i._boxNum != null);
    if (hasExcelBoxNums) {
      const refRow = [...plRows].sort((a, b) => a.boxStart - b.boxStart)[0];
      const labeled2 = partItems.map(item => {
        if (item._boxNum != null) {
          labeled++;
          return { ...item, box_label: `LOT#${refRow.lotNum} ${item._boxNum}/${refRow.totalBoxes}` };
        }
        return item;
      });
      result.push(...labeled2);
      continue;
    }

    // Fallback: positional assignment using DOCX packing list qty-per-box
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

  // Per-part, per-box breakdown (uses result — items with labels already assigned)
  const byPartBox = new Map<string, Map<string, string[]>>();
  for (const item of result) {
    if (!item.box_label) continue;
    if (!byPartBox.has(item.part_number)) byPartBox.set(item.part_number, new Map());
    const boxMap = byPartBox.get(item.part_number)!;
    if (!boxMap.has(item.box_label)) boxMap.set(item.box_label, []);
    boxMap.get(item.box_label)!.push(item.serial_number);
  }
  for (const [partName, boxMap] of byPartBox) {
    const sortedBoxes = [...boxMap.entries()].sort((a, b) => {
      const n = (s: string) => parseInt(s.match(/\s(\d+)\//)?.[1] ?? "0", 10);
      return n(a[0]) - n(b[0]);
    });
    const totalItems = [...boxMap.values()].reduce((s, v) => s + v.length, 0);
    log("BOX", `${partName} — ${sortedBoxes.length} boxes, ${totalItems} items`);
    for (const [box, sns] of sortedBoxes) {
      const sorted = sns.map(s => parseInt(s, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b);
      const list = sorted.length > 0 ? sorted.join(", ") : sns.join(", ");
      log("BOX", `  ${box}: ${sns.length} pcs  [${list}]`);
    }
  }

  // Items with no box label and no issue (these need attention)
  const noBoxNoIssue = result.filter(i => !i.box_label && !i.issue && !(i as ParsedItem)._isException);
  if (noBoxNoIssue.length > 0) {
    log("BOX", `⚠ ${noBoxNoIssue.length} items with NO BOX + NO ISSUE:`, "warn");
    const byPart = new Map<string, string[]>();
    for (const item of noBoxNoIssue) {
      if (!byPart.has(item.part_number)) byPart.set(item.part_number, []);
      byPart.get(item.part_number)!.push(item.serial_number);
    }
    for (const [part, sns] of byPart) {
      const sorted = sns.map(s => parseInt(s, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b);
      const list = sorted.length > 0 ? sorted.join(", ") : sns.join(", ");
      log("BOX", `  ${part}: ${sns.length} pcs  [${list}]`, "warn");
    }
  }

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

// After assignBoxLabels, marks clean items beyond PL qty as EXTRA status.
// Items are sorted by serial number — the first `plExpected` stay CREATED,
// everything beyond becomes EXTRA.
function markExtraItems(items: ParsedItem[], plData: PLData): ParsedItem[] {
  const plExpectedMap = new Map<string, number>();
  for (const row of plData.rows) {
    const key = normPart(row.partNumber);
    plExpectedMap.set(key, (plExpectedMap.get(key) ?? 0) + row.qtyTotal);
  }

  const cleanByPart = new Map<string, ParsedItem[]>();
  const others: ParsedItem[] = [];

  for (const item of items) {
    if (!item.issue && item.status === "OK") {
      const key = normPart(item.part_number);
      if (!cleanByPart.has(key)) cleanByPart.set(key, []);
      cleanByPart.get(key)!.push(item);
    } else {
      others.push(item);
    }
  }

  const result: ParsedItem[] = [...others];
  for (const [key, partItems] of cleanByPart) {
    const expected = plExpectedMap.get(key) ?? partItems.length;
    const sorted = [...partItems].sort(
      (a, b) => (parseInt(a.serial_number, 10) || 0) - (parseInt(b.serial_number, 10) || 0)
    );
    for (let i = 0; i < sorted.length; i++) {
      result.push(i < expected ? sorted[i] : { ...sorted[i], status: "EXTRA" });
    }
  }
  return result;
}

function buildCrossRefChecks(pl: PLData, parsedItems: ParsedItem[]): CrossRefRow[] {
  const totalByPart: Record<string, number> = {};
  const cleanByPart: Record<string, number> = {};
  const issuesByPart: Record<string, number> = {};
  const extraByPart: Record<string, number> = {};
  for (const item of parsedItems) {
    const key = normPart(item.part_number);
    totalByPart[key] = (totalByPart[key] ?? 0) + 1;
    if (item.status === "EXTRA") {
      extraByPart[key] = (extraByPart[key] ?? 0) + 1;
    } else if (item.issue) {
      issuesByPart[key] = (issuesByPart[key] ?? 0) + 1;
    } else {
      cleanByPart[key] = (cleanByPart[key] ?? 0) + 1;
    }
  }
  // Deduplicate: sum qtyTotal across multiple DOCX rows for the same part number
  const plExpectedByPart = new Map<string, number>();
  const plPartOrder: string[] = [];
  for (const row of pl.rows) {
    const key = normPart(row.partNumber);
    if (!plExpectedByPart.has(key)) plPartOrder.push(row.partNumber);
    plExpectedByPart.set(key, (plExpectedByPart.get(key) ?? 0) + row.qtyTotal);
  }
  return plPartOrder.map(partNumber => {
    const key = normPart(partNumber);
    const parsed = totalByPart[key] ?? 0;
    const clean = cleanByPart[key] ?? 0;
    const issues = issuesByPart[key] ?? 0;
    const extra = extraByPart[key] ?? 0;
    const plExpected = plExpectedByPart.get(key) ?? 0;
    return { partNumber, parsed, clean, issues, plExpected, fulfilled: clean >= plExpected, extra };
  });
}

function buildImportSummary(items: ParsedItem[]): Record<string, PartSummary> {
  const byPart: Record<string, PartSummary> = {};
  for (const item of items) {
    if (!byPart[item.part_number]) byPart[item.part_number] = { added: 0, bad: 0, manual: 0, extra: 0 };
    if (item.status === "MANUAL") byPart[item.part_number].manual++;
    else if (item.status === "EXTRA") byPart[item.part_number].extra++;
    else if (item.issue) byPart[item.part_number].bad++; // OK with known issue
    else byPart[item.part_number].added++;
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
      status: i.status ?? "OK", box_label: i.box_label ?? null, issue: i.issue ?? null,
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
  const qc = useQueryClient();
  const { data: issueDefinitions = [] } = useIssueDefinitions();
  const { data: productionOrders = [] } = useProductionOrders();
  const { data: clients = [] } = useClients();
  const [lotNumber, setLotNumber] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [plApproved, setPlApproved] = useState(false);
  const [serialApproved, setSerialApproved] = useState(false);
  const [issuesApproved, setIssuesApproved] = useState(false);
  const [extraUnitsApproved, setExtraUnitsApproved] = useState(false);

  // Packing list state
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [plData, setPlData] = useState<PLData | null>(null);
  const [plChecks, setPlChecks] = useState<CheckItem[] | null>(null);
  const [plError, setPlError] = useState("");
  const [docxDragging, setDocxDragging] = useState(false);
  const docxRef = useRef<HTMLInputElement>(null);

  // Serial numbers state
  const [snFile, setSnFile] = useState<File | null>(null);
  const [xlsxBuffer, setXlsxBuffer] = useState<ArrayBuffer | null>(null);
  const [xlsxDetectedParts, setXlsxDetectedParts] = useState<string[]>([]);
  const [partRangeConfigs, setPartRangeConfigs] = useState<PartRangeConfig[]>([]);
  const [parsedItems, setParsedItems] = useState<ParsedItem[] | null>(null);
  const [importSummary, setImportSummary] = useState<Record<string, PartSummary> | null>(null);
  const [crossRefChecks, setCrossRefChecks] = useState<CrossRefRow[] | null>(null);
  const [expandedIssueNodes, setExpandedIssueNodes] = useState<Set<string>>(new Set());
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());
  const [creatingLot, setCreatingLot] = useState(false);
  const [lotCreated, setLotCreated] = useState(false);
  const [snError, setSnError] = useState("");
  const [snDragging, setSnDragging] = useState(false);
  const snRef = useRef<HTMLInputElement>(null);

  // Manual item add
  const [manualAddPart, setManualAddPart] = useState<string | null>(null);
  const [manualSerials, setManualSerials] = useState("");
  const [manualBox, setManualBox] = useState("");
  const [manualSubtractPart, setManualSubtractPart] = useState<string | null>(null);
  const [manualSubtractCount, setManualSubtractCount] = useState("");

  // Manual add with issue
  const [manualIssueAddPart, setManualIssueAddPart] = useState<string | null>(null);
  const [manualIssueSerials, setManualIssueSerials] = useState("");
  const [manualIssueBox, setManualIssueBox] = useState("");
  const [manualIssueId, setManualIssueId] = useState<string>("none");

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

  function handleManualAdd() {
    if (!parsedItems || !manualAddPart || !manualBox.trim()) return;
    const serials = manualSerials.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
    if (serials.length === 0) return;
    const totalBoxes = plDataRef.current?.summary.totalBoxes ?? 0;
    const lotNum = plDataRef.current?.rows[0]?.lotNum ?? lotNumber.replace(/\D/g, "");
    const boxLabel = totalBoxes > 0 ? `LOT#${lotNum} ${manualBox.trim()}/${totalBoxes}` : undefined;
    const newItems: ParsedItem[] = serials.map(sn => ({
      part_number: manualAddPart,
      serial_number: sn,
      lot_number: lotNumber,
      status: "OK" as const,
      issue: null,
      box_label: boxLabel,
    }));
    const updated = [...parsedItems, ...newItems];
    setParsedItems(updated);
    setImportSummary(buildImportSummary(updated));
    if (plDataRef.current) setCrossRefChecks(buildCrossRefChecks(plDataRef.current, updated));
    setManualAddPart(null);
    setManualSerials("");
    setManualBox("");
  }

  function handleManualSubtract() {
    if (!parsedItems || !manualSubtractPart) return;
    const n = parseInt(manualSubtractCount.trim(), 10);
    if (isNaN(n) || n <= 0) return;
    // Remove the last N items of this part (reverse order so we trim from the end)
    let removed = 0;
    const updated = [...parsedItems].reverse().filter(item => {
      if (item.part_number === manualSubtractPart && removed < n) { removed++; return false; }
      return true;
    }).reverse();
    setParsedItems(updated);
    setImportSummary(buildImportSummary(updated));
    if (plDataRef.current) setCrossRefChecks(buildCrossRefChecks(plDataRef.current, updated));
    setManualSubtractPart(null);
    setManualSubtractCount("");
  }

  function handleManualAddWithIssue() {
    if (!parsedItems || !manualIssueAddPart || !manualIssueBox.trim()) return;
    const serials = manualIssueSerials.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
    if (serials.length === 0) return;
    const issueDef = issueDefinitions?.find(d => d.id === manualIssueId);
    const totalBoxes = plDataRef.current?.summary.totalBoxes ?? 0;
    const lotNum = plDataRef.current?.rows[0]?.lotNum ?? lotNumber.replace(/\D/g, "");
    const boxLabel = totalBoxes > 0 ? `LOT#${lotNum} ${manualIssueBox.trim()}/${totalBoxes}` : undefined;
    const newItems: ParsedItem[] = serials.map(sn => ({
      part_number: manualIssueAddPart,
      serial_number: sn,
      lot_number: lotNumber,
      status: "MANUAL" as ManufacturedItemStatus,
      issue: issueDef?.name ?? null,
      box_label: boxLabel,
    }));
    const updated = [...parsedItems, ...newItems];
    setParsedItems(updated);
    setImportSummary(buildImportSummary(updated));
    if (plDataRef.current) setCrossRefChecks(buildCrossRefChecks(plDataRef.current, updated));
    setManualIssueAddPart(null);
    setManualIssueSerials("");
    setManualIssueBox("");
    setManualIssueId("none");
  }

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
    setXlsxBuffer(null);
    setResolvedKeys(new Set()); setLotCreated(false); setPlApproved(false); setSerialApproved(false); setIssuesApproved(false); setExtraUnitsApproved(false);
    const lot = lotNumber.trim();
    if (!lot) { setSnError("Enter a LOT # first."); return; }

    const isCSV = file.name.toLowerCase().endsWith(".csv");
    addLog(isCSV ? "CSV" : "EXCEL", `Loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    const reader = new FileReader();
    reader.onerror = () => { setSnError("Could not read the file."); addLog("EXCEL", "File read error", "error"); };

    if (isCSV) {
      reader.onload = (ev) => {
        try {
          const raw = parseCSVLot(ev.target?.result as string, lot, addLog);
          if (raw.length === 0) { setSnError("No valid items found."); return; }
          const currentPl = plDataRef.current;
          const labeled = assignBoxLabels(raw, currentPl, addLog);
          const parsed = currentPl ? markExtraItems(labeled, currentPl) : labeled;
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
        const buf = ev.target?.result as ArrayBuffer;
        setXlsxBuffer(buf);

        // Parse workbook — expand !ref to cover all actual cells (fixes stale <dimension> element)
        const wb = XLSX.read(buf, { type: "array" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const declaredRef = ws["!ref"] ?? "";
        const actualRef = XLSX.utils.encode_range(
          Object.keys(ws)
            .filter(k => /^[A-Z]+\d+$/.test(k))
            .reduce((acc, k) => {
              const { r, c } = XLSX.utils.decode_cell(k);
              return { s: { r: Math.min(acc.s.r, r), c: Math.min(acc.s.c, c) }, e: { r: Math.max(acc.e.r, r), c: Math.max(acc.e.c, c) } };
            }, { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } })
        );
        if (actualRef !== declaredRef) {
          ws["!ref"] = actualRef;
          addLog("EXCEL", `Expanded !ref from ${declaredRef} to ${actualRef} (sheet had cells beyond declared range)`, "warn");
        }

        const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null });

        // Find header row
        let headerIdx = 0;
        for (let ri = 0; ri < Math.min(rows.length, 5); ri++) {
          const row = rows[ri] as (string | number | null)[];
          const hasParts = [0, 2, 4, 6, 8, 10, 12].some(c => {
            const v = row[c];
            return typeof v === "string" && (v.includes("-") || v.includes("_")) && /^[A-Za-z]/.test(v) && !v.includes(" ") && v.length > 5;
          });
          if (hasParts) { headerIdx = ri; break; }
        }
        const dataStart = headerIdx + 1;
        const header = rows[headerIdx] as (string | number | null)[];

        // Collect data columns
        const dataColIndices: number[] = [];
        const detectedParts: string[] = [];
        for (let c = 0; c < header.length; c += 2) {
          const v = header[c];
          if (typeof v === "string" && (v.includes("-") || v.includes("_"))) {
            dataColIndices.push(c);
            detectedParts.push(v.trim());
          }
        }
        setXlsxDetectedParts(detectedParts);

        // Detect global separator row (all data cols blank simultaneously)
        let separatorRow = -1;
        for (let r = dataStart + 1; r < rows.length; r++) {
          const row = rows[r] as (string | number | null)[];
          if (dataColIndices.every(ci => row[ci] == null || row[ci] === "")) { separatorRow = r; break; }
        }
        const packedEnd = separatorRow > 0 ? separatorRow : rows.length;

        // For each column find first + last non-blank row in packed range
        const colRanges = new Map<number, { firstRow: number; lastRow: number }>();
        for (const ci of dataColIndices) {
          let firstRow = -1, lastRow = -1;
          for (let r = dataStart; r < packedEnd; r++) {
            let val = (rows[r] as (string | number | null)[])[ci];
            if (val == null || val === "") {
              const rawCell = ws[XLSX.utils.encode_cell({ r, c: ci })];
              if (rawCell?.v != null || (rawCell?.w && rawCell.w.trim() !== "")) val = (rawCell?.v ?? rawCell?.w) as string | number;
            }
            if (val != null && val !== "") {
              if (firstRow === -1) firstRow = r;
              lastRow = r;
            }
          }
          if (firstRow !== -1) colRanges.set(ci, { firstRow, lastRow });
        }

        // Build configs — prefer DOCX part list, fallback to Excel header
        const pl = plDataRef.current;
        const sourceParts = pl && pl.rows.length > 0
          ? [...new Set(pl.rows.map(r => r.partNumber))]
          : detectedParts;
        const normalize = (s: string) => s.replace(/[-_]/g, "").toUpperCase();

        const seen = new Set<string>();
        const configs: PartRangeConfig[] = [];
        for (let idx = 0; idx < detectedParts.length; idx++) {
          const excelPn = detectedParts[idx];
          const matchedPn = sourceParts.find(pn => normalize(pn) === normalize(excelPn)) ?? excelPn;
          if (seen.has(matchedPn)) continue;
          seen.add(matchedPn);
          const ci = dataColIndices[idx];
          const range = colRanges.get(ci);
          const colLetter = XLSX.utils.encode_col(ci);
          const cellRange = range ? `${colLetter}${range.firstRow + 1}:${colLetter}${range.lastRow + 1}` : "";
          const isRange = detectIsRange(rows, ci, dataStart);
          const isQty = !isRange && detectIsQuantity(rows, ci, dataStart);
          const type: PartRangeConfig["type"] = isQty ? "count" : isRange ? "range" : "individual";
          configs.push({ id: `${matchedPn}-${Date.now()}-${idx}`, partNumber: matchedPn, cellRange, type });
        }
        if (configs.length === 0) configs.push({ id: `cfg-0`, partNumber: "", cellRange: "", type: "auto" });
        setPartRangeConfigs(configs);

        if (separatorRow > 0) addLog("EXCEL", `Separator row detected at row ${separatorRow + 1}`, "warn");
        addLog("EXCEL", `Auto-detected ${configs.length} parts — verify ranges below and click Parse:`);
        for (const cfg of configs) addLog("EXCEL", `  ${cfg.partNumber}  →  ${cfg.cellRange || "(no range detected)"}  [${cfg.type}]`);
      };
      reader.readAsArrayBuffer(file);
    }
  }

  async function handleParseExcel() {
    if (!xlsxBuffer) return;
    const lot = lotNumber.trim();
    if (!lot) { setSnError("Enter a LOT # first."); return; }
    setSnError("");
    setParsedItems(null); setImportSummary(null); setCrossRefChecks(null);
    try {
      // For quantity-mode parts, find the current max serial in the DB so we
      // continue numbering from where the last LOT left off (avoids overwriting).
      const quantityParts = partRangeConfigs
        .filter(c => c.type === "count" || (c.type === "auto" && c.cellRange.trim()))
        .map(c => c.partNumber)
        .filter(Boolean);

      const startSerials: Record<string, number> = {};
      if (quantityParts.length > 0 && selectedOrderId) {
        const supabase = createClient();
        // Get all lot numbers already imported for this production order
        const { data: orderLots } = await supabase
          .from("lot_imports")
          .select("lot_number")
          .eq("production_order_id", selectedOrderId);
        const orderLotNumbers = (orderLots ?? []).map(l => l.lot_number).filter(Boolean);
        if (orderLotNumbers.length > 0) {
          const { data } = await supabase
            .from("manufactured_items")
            .select("part_number, serial_number")
            .in("part_number", quantityParts)
            .in("lot_number", orderLotNumbers);
          for (const row of data ?? []) {
            const n = parseInt(row.serial_number, 10);
            if (!isNaN(n)) {
              startSerials[row.part_number] = Math.max(startSerials[row.part_number] ?? 0, n);
            }
          }
          for (const pn of Object.keys(startSerials)) {
            if (startSerials[pn] > 0) addLog("EXCEL", `${pn}: continuing from serial ${startSerials[pn] + 1} (${startSerials[pn]} existing in this order)`, "warn");
          }
        }
      }

      const raw = parseExcelWithRanges(xlsxBuffer, lot, partRangeConfigs, issueDefinitions, addLog, startSerials);
      if (raw.length === 0) { setSnError("No valid items found — check your cell ranges."); return; }
      const currentPl = plDataRef.current;
      const labeled = assignBoxLabels(raw, currentPl, addLog);
      const parsed = currentPl ? markExtraItems(labeled, currentPl) : labeled;
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
  }

  function handleResolve(key: string) {
    setResolvedKeys(prev => new Set([...prev, key]));
  }

  async function handleCreateLot() {
    if (!parsedItems || !lotNumber.trim() || !selectedOrderId || !selectedClientId) return;
    setCreatingLot(true);
    try {
      const supabase = createClient();
      const lot = lotNumber.trim();

      // item_count = CREATED only (EXTRA tracked separately via extra_units JSONB)
      const createdCount = parsedItems.filter(i => i.status === "OK").length;
      const extraUnitsPayload = crossRefChecks
        ? Object.fromEntries(crossRefChecks.filter(r => r.extra > 0).map(r => [r.partNumber, r.extra]))
        : null;
      const missingUnitsPayload = crossRefChecks
        ? Object.fromEntries(crossRefChecks.filter(r => !r.fulfilled && r.plExpected > r.clean).map(r => [r.partNumber, r.plExpected - r.clean]))
        : null;

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
          .update({
            item_count: createdCount,
            production_order_id: selectedOrderId,
            client_id: selectedClientId,
            pl_approved: plApproved,
            serial_approved: serialApproved,
            extra_units: extraUnitsPayload && Object.keys(extraUnitsPayload).length > 0 ? extraUnitsPayload : null,
            missing_units: missingUnitsPayload && Object.keys(missingUnitsPayload).length > 0 ? missingUnitsPayload : null,
          })
          .eq("id", existing.id);
        if (updateError) throw updateError;
      } else {
        // Create new lot_imports entry
        const { error: lotError } = await supabase
          .from("lot_imports")
          .insert({
            lot_number: lot,
            item_count: createdCount,
            production_order_id: selectedOrderId,
            client_id: selectedClientId,
            pl_approved: plApproved,
            serial_approved: serialApproved,
            extra_units: extraUnitsPayload && Object.keys(extraUnitsPayload).length > 0 ? extraUnitsPayload : null,
            missing_units: missingUnitsPayload && Object.keys(missingUnitsPayload).length > 0 ? missingUnitsPayload : null,
          });
        if (lotError) throw lotError;
      }

      // Deduplicate by part_number+serial_number before upsert
      // (duplicates in the parsed batch cause "ON CONFLICT DO UPDATE cannot affect row a second time")
      const seen = new Set<string>();
      const uniqueItems = parsedItems.filter(i => {
        const key = `${i.part_number}::${i.serial_number}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Upsert all manufactured items
      const { error: itemsError } = await supabase
        .from("manufactured_items")
        .upsert(uniqueItems.map(i => ({
          part_number: i.part_number,
          serial_number: i.serial_number,
          lot_number: i.lot_number,
          status: i.status,
          issue: i.issue ?? null,
          client_id: selectedClientId,
          box_label: i.box_label ?? null,
        })), { onConflict: "part_number,serial_number" });
      if (itemsError) throw itemsError;

      setLotCreated(true);
      toast.success(`LOT "${lot}" created — ${parsedItems.length} items added to inventory`);
      await qc.invalidateQueries({ queryKey: ["lot_imports"] });
      await qc.invalidateQueries({ queryKey: ["manufactured_items"] });
      await qc.invalidateQueries({ queryKey: ["manufactured_items", "lot_numbers"] });
      setTimeout(() => router.push("/lots"), 1500);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreatingLot(false);
    }
  }

  const allPlPassed = plChecks?.every(c => c.passed) ?? false;
  const allCrossRefPassed = crossRefChecks?.every(c => c.fulfilled) ?? false;
  const hasMissingUnits = crossRefChecks?.some(c => !c.fulfilled) ?? false;
  const totalMissing = (crossRefChecks ?? []).reduce((s, r) => s + Math.max(0, r.plExpected - r.clean), 0);
  const canDownload = parsedItems && parsedItems.length > 0 && lotNumber.trim();
  const issueItems = (parsedItems ?? []).filter(i => i.issue || i.status === "MANUAL");
  const hasIssues = issueItems.length > 0;
  const totalExtra = (crossRefChecks ?? []).reduce((s, r) => s + r.extra, 0);
  const hasExtra = totalExtra > 0;
  const canCreateLot = canDownload && selectedOrderId && selectedClientId && (!hasIssues || issuesApproved) && (!hasExtra || extraUnitsApproved);
  const summaryTotals = importSummary
    ? Object.values(importSummary).reduce((acc, v) => ({ added: acc.added + v.added, bad: acc.bad + v.bad, manual: acc.manual + v.manual, extra: acc.extra + v.extra }), { added: 0, bad: 0, manual: 0, extra: 0 })
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
          <span>Tools</span><span>/</span><span className="text-zinc-300">LOT-TOOL</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-100">LOT-TOOL</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Convert factory files to GBX format for reliable LOT import.</p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-5 items-start">

        {/* ── Left: Converter ── */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-5">

          {/* LOT # + Order + Client */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">LOT Number</Label>
              <Input
                placeholder="e.g. LOT2"
                value={lotNumber}
                onChange={e => setLotNumber(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300 flex items-center gap-1">
                Production Order <span className="text-red-400">*</span>
              </Label>
              <Select value={selectedOrderId} onValueChange={setSelectedOrderId}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9">
                  <SelectValue placeholder="Select order…" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  {productionOrders.map(o => (
                    <SelectItem key={o.id} value={o.id} className="text-zinc-100 focus:bg-zinc-700 focus:text-white">
                      {o.order_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300 flex items-center gap-1">
                Client <span className="text-red-400">*</span>
              </Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-9">
                  <SelectValue placeholder="Select client…" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-zinc-100 focus:bg-zinc-700 focus:text-white">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                : xlsxBuffer ? "border-green-600/50 bg-green-500/5 cursor-pointer"
                : "border-zinc-600 hover:border-zinc-400 cursor-pointer"
              }`}
            >
              <FileSpreadsheet className="h-4 w-4 text-zinc-400 flex-shrink-0" />
              <span className="text-sm text-zinc-400 truncate">
                {xlsxBuffer ? `${snFile?.name} — ready to configure` : snDragging ? "Drop here" : "Click or drag serial number file (.xlsx)"}
              </span>
              <input ref={snRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleSnFile(f); e.target.value = ""; }} />
            </div>

            {/* Part Range Configuration — shown after Excel uploaded */}
            {xlsxBuffer && (
              <div className="bg-zinc-800/60 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700">
                  <p className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wider">Configure Part Ranges</p>
                  <span className="text-zinc-600 text-[10px]">Format: A3:A182</span>
                </div>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-2 px-3 py-1.5 border-b border-zinc-700/50 bg-zinc-900/40">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">Part Number</span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">Cell Range</span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold w-20">Type</span>
                  <span className="w-6" />
                </div>
                {/* Config rows */}
                <div className="divide-y divide-zinc-700/40">
                  {partRangeConfigs.map((cfg, i) => {
                    const plParts = [...new Set([
                      ...(plData?.rows ?? []).map(r => r.partNumber),
                      ...xlsxDetectedParts,
                    ])];
                    return (
                      <div key={cfg.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-2 items-center px-3 py-2">
                        <Select
                          value={cfg.partNumber || "none"}
                          onValueChange={v => setPartRangeConfigs(prev => prev.map((c, j) => j === i ? { ...c, partNumber: v === "none" ? "" : v } : c))}
                        >
                          <SelectTrigger className="h-7 text-xs bg-zinc-900 border-zinc-700 text-zinc-200 font-mono">
                            <SelectValue placeholder="Select part…" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                            <SelectItem value="none" className="text-zinc-500 focus:bg-zinc-700">Select part…</SelectItem>
                            {plParts.map(pn => (
                              <SelectItem key={pn} value={pn} className="text-zinc-100 font-mono text-xs focus:bg-zinc-700 focus:text-white">{pn}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <input
                          value={cfg.cellRange}
                          onChange={e => setPartRangeConfigs(prev => prev.map((c, j) => j === i ? { ...c, cellRange: e.target.value.toUpperCase() } : c))}
                          placeholder="A3:A182"
                          className="h-7 text-xs font-mono bg-zinc-900 border border-zinc-700 rounded px-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 w-full"
                        />
                        <Select
                          value={cfg.type}
                          onValueChange={v => setPartRangeConfigs(prev => prev.map((c, j) => j === i ? { ...c, type: v as PartRangeConfig["type"] } : c))}
                        >
                          <SelectTrigger className="h-7 text-xs bg-zinc-900 border-zinc-700 text-zinc-200 w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                            <SelectItem value="auto" className="text-zinc-100 text-xs focus:bg-zinc-700">Auto</SelectItem>
                            <SelectItem value="individual" className="text-zinc-100 text-xs focus:bg-zinc-700">Individual</SelectItem>
                            <SelectItem value="range" className="text-zinc-100 text-xs focus:bg-zinc-700">Range</SelectItem>
                            <SelectItem value="count" className="text-zinc-100 text-xs focus:bg-zinc-700">Count</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => setPartRangeConfigs(prev => prev.filter((_, j) => j !== i))}
                          className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors text-sm"
                        >×</button>
                      </div>
                    );
                  })}
                </div>
                {/* Footer: Add + Parse */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-700 bg-zinc-900/30">
                  <button
                    onClick={() => setPartRangeConfigs(prev => [...prev, { id: `cfg-${Date.now()}`, partNumber: "", cellRange: "", type: "auto" }])}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    + Add Part
                  </button>
                  <button
                    onClick={handleParseExcel}
                    disabled={partRangeConfigs.every(c => !c.partNumber || !c.cellRange.trim())}
                    className="text-xs font-semibold px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Parse
                  </button>
                </div>
              </div>
            )}

            {snError && <p className="text-red-400 text-xs">{snError}</p>}

            {importSummary && summaryTotals && (
              <div className="bg-zinc-800/60 rounded-lg p-3 space-y-1.5">
                <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Parsed Items</p>
                {Object.entries(importSummary).map(([part, counts]) => (
                  <div key={part} className="flex items-center gap-3">
                    <span className="text-zinc-300 text-xs font-mono flex-1 truncate">{part}</span>
                    <span className="text-teal-400 text-xs">{fmt(counts.added)} ok</span>
                    {counts.extra > 0 && <span className="text-orange-400 text-xs">+{counts.extra} extra</span>}
                    {counts.manual > 0 && <span className="text-purple-400 text-xs">{counts.manual} manual</span>}
                  </div>
                ))}
                <Separator className="bg-zinc-700 my-1" />
                <div className="flex gap-4 text-xs font-medium">
                  <span className="text-zinc-300">{fmt(summaryTotals.added)} Added</span>
                  {summaryTotals.extra > 0 && <span className="text-orange-400">{fmt(summaryTotals.extra)} Extra</span>}
                  {summaryTotals.manual > 0 && <span className="text-purple-400">{fmt(summaryTotals.manual)} Manual</span>}
                </div>
              </div>
            )}

            {crossRefChecks && (() => {
              const allFulfilled = crossRefChecks.every(c => c.fulfilled);
              const failedCount = crossRefChecks.filter(c => !c.fulfilled).length;
              const totalExtra = crossRefChecks.reduce((s, r) => s + r.extra, 0);
              return (
                <div className="bg-zinc-800/60 rounded-lg overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700">
                    <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">Cross-Reference vs Packing List</p>
                    {allFulfilled
                      ? <span className="text-green-400 text-sm font-bold uppercase tracking-widest">✓ PASSED</span>
                      : <span className="text-red-400 text-sm font-bold uppercase tracking-widest">✗ ERROR — {failedCount} failed</span>
                    }
                  </div>
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-3 py-1.5 border-b border-zinc-700/50 bg-zinc-900/40">
                    <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold">Part Number</span>
                    <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold w-14 text-right">Parsed</span>
                    <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold w-20 text-right">PL Fulfill</span>
                    <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold w-14 text-right">Issues</span>
                    <span className="w-12" />
                  </div>
                  {/* Rows */}
                  {crossRefChecks.map((row, i) => (
                    <div key={i} className={`${i < crossRefChecks.length - 1 ? "border-b border-zinc-700/40" : ""} ${i % 2 === 1 ? "bg-zinc-800/30" : ""}`}>
                      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckIcon passed={row.fulfilled} />
                          <span className="text-zinc-200 text-xs font-mono font-semibold truncate">{row.partNumber}</span>
                          {row.extra > 0 && (
                            <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded shrink-0">
                              +{row.extra}
                            </span>
                          )}
                        </div>
                        <span className="text-zinc-400 text-xs font-medium w-14 text-right">{row.parsed}</span>
                        <span className={`text-xs font-semibold w-20 text-right ${row.fulfilled ? "text-green-400" : "text-red-400"}`}>
                          {Math.min(row.clean, row.plExpected)}/{row.plExpected}
                        </span>
                        <span className={`text-xs font-semibold w-14 text-right ${row.issues > 0 ? "text-amber-400" : "text-zinc-600"}`}>
                          {row.issues > 0 ? row.issues : "—"}
                        </span>
                        <div className="flex gap-1 items-center w-16 justify-end">
                          {row.extra > 0 && (
                            <button
                              onClick={() => { setManualSubtractPart(manualSubtractPart === row.partNumber ? null : row.partNumber); setManualSubtractCount(String(row.extra)); setManualAddPart(null); setManualIssueAddPart(null); }}
                              className="text-zinc-500 hover:text-red-400 transition-colors text-base leading-none font-bold w-5 text-center"
                              title="Remove excess items"
                            >
                              {manualSubtractPart === row.partNumber ? "×" : "−"}
                            </button>
                          )}
                          {!row.fulfilled && (
                            <button
                              onClick={() => { setManualAddPart(manualAddPart === row.partNumber ? null : row.partNumber); setManualSubtractPart(null); setManualIssueAddPart(null); }}
                              className="text-zinc-500 hover:text-blue-400 transition-colors text-base leading-none font-bold w-5 text-center"
                              title="Manually add serials"
                            >
                              {manualAddPart === row.partNumber ? "×" : "+"}
                            </button>
                          )}
                          <button
                            onClick={() => { setManualIssueAddPart(manualIssueAddPart === row.partNumber ? null : row.partNumber); setManualAddPart(null); setManualSubtractPart(null); setManualIssueId("none"); setManualIssueSerials(""); setManualIssueBox(""); }}
                            className="text-zinc-500 hover:text-amber-400 transition-colors w-5 flex items-center justify-center"
                            title="Add serials with known issue"
                          >
                            {manualIssueAddPart === row.partNumber ? <XCircle className="h-3.5 w-3.5" /> : <HelpCircle className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                      {/* Manual subtract inline form */}
                      {manualSubtractPart === row.partNumber && (
                        <div className="mx-3 mb-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-2">
                          <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Remove Items — {row.partNumber.split("_").pop()}</p>
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              min={1}
                              max={row.parsed}
                              value={manualSubtractCount}
                              onChange={e => setManualSubtractCount(e.target.value)}
                              placeholder="Count to remove"
                              className="text-xs font-mono bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 placeholder:text-zinc-600 w-36 focus:outline-none focus:border-red-500/50"
                            />
                            <span className="text-zinc-600 text-xs">of {row.parsed} parsed</span>
                            <button
                              onClick={handleManualSubtract}
                              disabled={!manualSubtractCount.trim() || parseInt(manualSubtractCount) <= 0}
                              className="text-xs font-semibold px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Remove
                            </button>
                            <button
                              onClick={() => { setManualSubtractPart(null); setManualSubtractCount(""); }}
                              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Manual add inline form */}
                      {manualAddPart === row.partNumber && (
                        <div className="mx-3 mb-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
                          <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Manual Add — {row.partNumber.split("_").pop()}</p>
                          <textarea
                            value={manualSerials}
                            onChange={e => setManualSerials(e.target.value)}
                            placeholder={"Serial numbers (one per line or comma-separated)\ne.g.\n25050192\n25050018\n25050043"}
                            className="w-full text-xs font-mono bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 placeholder:text-zinc-600 resize-none h-28 focus:outline-none focus:border-blue-500/50"
                          />
                          <div className="flex gap-2 items-center">
                            <input
                              value={manualBox}
                              onChange={e => setManualBox(e.target.value)}
                              placeholder="Box # (e.g. 15)"
                              className="text-xs font-mono bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 placeholder:text-zinc-600 w-36 focus:outline-none focus:border-blue-500/50"
                            />
                            <button
                              onClick={handleManualAdd}
                              disabled={!manualSerials.trim() || !manualBox.trim()}
                              className="text-xs font-semibold px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Add Items
                            </button>
                            <button
                              onClick={() => { setManualAddPart(null); setManualSerials(""); setManualBox(""); }}
                              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Add with issue inline form */}
                      {manualIssueAddPart === row.partNumber && (
                        <div className="mx-3 mb-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
                          <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Add with Issue — {row.partNumber.split("_").pop()}</p>
                          <Select value={manualIssueId} onValueChange={setManualIssueId}>
                            <SelectTrigger className="h-7 text-xs bg-zinc-900 border-zinc-700 text-zinc-100 w-full">
                              <SelectValue placeholder="Select issue…" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-800 border-zinc-700">
                              <SelectItem value="none" className="text-zinc-400 text-xs">No issue (unknown)</SelectItem>
                              {issueDefinitions.map(def => (
                                <SelectItem key={def.id} value={def.id} className="text-zinc-100 text-xs">{def.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <textarea
                            value={manualIssueSerials}
                            onChange={e => setManualIssueSerials(e.target.value)}
                            placeholder={"Serial numbers (one per line or comma-separated)\ne.g.\n25050192\n25050018\n25050043"}
                            className="w-full text-xs font-mono bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 placeholder:text-zinc-600 resize-none h-24 focus:outline-none focus:border-amber-500/50"
                          />
                          <div className="flex gap-2 items-center">
                            <input
                              value={manualIssueBox}
                              onChange={e => setManualIssueBox(e.target.value)}
                              placeholder="Box # (e.g. 15)"
                              className="text-xs font-mono bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 placeholder:text-zinc-600 w-36 focus:outline-none focus:border-amber-500/50"
                            />
                            <button
                              onClick={handleManualAddWithIssue}
                              disabled={!manualIssueSerials.trim() || !manualIssueBox.trim()}
                              className="text-xs font-semibold px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Add with Issue
                            </button>
                            <button
                              onClick={() => { setManualIssueAddPart(null); setManualIssueSerials(""); setManualIssueBox(""); setManualIssueId("none"); }}
                              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {allFulfilled && totalExtra > 0 && (
                    <div className="flex items-start gap-2 px-3 py-2 border-t border-amber-500/20 bg-amber-500/5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-400">
                        <span className="font-semibold">{totalExtra} extra units</span> above PL —{" "}
                        {crossRefChecks.filter(r => r.extra > 0).map(r => `${r.partNumber.split("_").pop()} +${r.extra}`).join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

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

          {/* Approvals */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 space-y-2">
            <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Approvals</p>
            <button
              type="button"
              disabled={!allPlPassed}
              onClick={() => allPlPassed && setPlApproved(v => !v)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2 rounded-lg border transition-colors text-left",
                plApproved
                  ? "border-green-500/40 bg-green-500/10 text-green-400"
                  : allPlPassed
                  ? "border-zinc-600 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800"
                  : "border-zinc-800 text-zinc-600 cursor-not-allowed opacity-50"
              )}
            >
              <div className={cn("h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                plApproved ? "border-green-400 bg-green-400" : "border-zinc-600"
              )}>
                {plApproved && <CheckCircle2 className="h-3 w-3 text-zinc-900" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">PL Approved</p>
                <p className="text-[10px] text-zinc-500">
                  {allPlPassed ? "Packing list checks passed — ready to approve" : "All packing list checks must pass first"}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSerialApproved(v => !v)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2 rounded-lg border transition-colors text-left",
                serialApproved && !hasMissingUnits
                  ? "border-green-500/40 bg-green-500/10 text-green-400"
                  : serialApproved && hasMissingUnits
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                  : "border-zinc-600 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800"
              )}
            >
              <div className={cn("h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                serialApproved && !hasMissingUnits ? "border-green-400 bg-green-400"
                : serialApproved && hasMissingUnits ? "border-amber-400 bg-amber-400"
                : "border-zinc-600"
              )}>
                {serialApproved && <CheckCircle2 className="h-3 w-3 text-zinc-900" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Serial Approved</p>
                <p className="text-[10px] text-zinc-500">
                  {allCrossRefPassed
                    ? "Cross-reference checks passed — ready to approve"
                    : hasMissingUnits
                    ? `${totalMissing} unit${totalMissing !== 1 ? "s" : ""} missing — approving will add a warning to the Production Order`
                    : "All serial cross-reference checks must pass first"}
                </p>
              </div>
            </button>

            {hasIssues && (
              <button
                type="button"
                onClick={() => setIssuesApproved(v => !v)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2 rounded-lg border transition-colors text-left",
                  issuesApproved
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                    : "border-zinc-600 text-zinc-300 hover:border-amber-500/40 hover:bg-amber-500/5"
                )}
              >
                <div className={cn(
                  "h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                  issuesApproved ? "border-amber-400 bg-amber-400" : "border-zinc-600"
                )}>
                  {issuesApproved && <CheckCircle2 className="h-3 w-3 text-zinc-900" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">Issues Acknowledged</p>
                  <p className="text-[10px] text-zinc-500">
                    {issuesApproved
                      ? `${issueItems.length} items flagged — will be tracked on the Production Order until resolved`
                      : `${issueItems.length} items have issues — approve to carry them over to the next LOT`}
                  </p>
                </div>
              </button>
            )}

            {hasExtra && (
              <button
                type="button"
                onClick={() => setExtraUnitsApproved(v => !v)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2 rounded-lg border transition-colors text-left",
                  extraUnitsApproved
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                    : "border-zinc-600 text-zinc-300 hover:border-amber-500/40 hover:bg-amber-500/5"
                )}
              >
                <div className={cn(
                  "h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                  extraUnitsApproved ? "border-amber-400 bg-amber-400" : "border-zinc-600"
                )}>
                  {extraUnitsApproved && <CheckCircle2 className="h-3 w-3 text-zinc-900" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">Extra Units Acknowledged</p>
                  <p className="text-[10px] text-zinc-500">
                    {extraUnitsApproved
                      ? `${totalExtra} extra units above PL — saved as warning on the Production Order`
                      : `${totalExtra} units exceed PL quantities — acknowledge to proceed`}
                  </p>
                </div>
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <p className="text-zinc-500 text-xs">
              {canCreateLot
                ? <span className="text-zinc-300"><span className="text-teal-400 font-medium">{fmt(parsedItems!.length)} items</span>{plData ? `, ${plData.rows.length} PL products` : ""} ready</span>
                : hasExtra && !extraUnitsApproved
                ? <span className="text-amber-400">Acknowledge the {totalExtra} extra units above PL to continue.</span>
                : hasIssues && !issuesApproved
                ? <span className="text-amber-400">Acknowledge the {issueItems.length} flagged items to continue.</span>
                : !selectedOrderId || !selectedClientId
                ? <span className="text-amber-400">Select a production order and client to continue.</span>
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
                disabled={!canCreateLot || creatingLot || lotCreated}
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
              {logs.length > 0 && (
                <button
                  onClick={() => {
                    const text = logs.map(e => `[${e.tag}]  ${e.message}`).join("\n");
                    navigator.clipboard.writeText(text);
                    toast.success("Log copied to clipboard");
                  }}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 px-2 py-1 rounded transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
              )}
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
