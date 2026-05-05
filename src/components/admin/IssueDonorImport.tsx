import React, { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseNum(val: any): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return Math.round(val);
  const n = parseFloat(String(val).replace(/[,\s$%]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

/** Parse "CA / 010" or "CA / 1" or "CA-001" → { state, num, code } */
function parseCdCell(raw: any): { stateCode: string; districtNum: number; cdCode: string } | null {
  if (raw == null) return null;
  const str = String(raw).trim().toUpperCase();
  if (!str || str === 'N/A' || str === 'TOTAL') return null;
  const m = str.match(/^([A-Z]{2})\s*[\/\-\s]\s*(\d+|AT.?LARGE|AL)\s*$/);
  if (!m) return null;
  const stateCode = m[1];
  let numToken = m[2];
  if (/AT.?LARGE|^AL$/.test(numToken)) numToken = '1';
  const districtNum = parseInt(numToken, 10);
  if (isNaN(districtNum)) return null;
  const cdCode = `${stateCode}-${String(districtNum).padStart(3, '0')}`;
  return { stateCode, districtNum, cdCode };
}

interface SheetParseResult {
  sheetName: string;
  issueName: string;
  issueSlug: string;
  rows: Array<{
    cd_code: string;
    state_code: string;
    district_num: number;
    gold_donors: number;
    gold_cell_phones: number;
    gold_addresses: number;
    silver_donors: number;
    silver_cell_phones: number;
    silver_addresses: number;
  }>;
  skipped: number;
}

/**
 * Parse a single sheet that uses 2-row headers:
 *  Row 1: ('', 'Gold', '', '', 'Silver', '', '')
 *  Row 2: ('CD', 'Donors', 'Cells/Cell Phones', 'Addresses', 'Donors', 'Cell Phones', 'Addresses')
 * Then data rows with CD codes like "CA / 010".
 */
function parseSheet(sheetName: string, sheet: XLSX.WorkSheet): SheetParseResult {
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false });
  if (rows.length < 3) {
    return { sheetName, issueName: sheetName, issueSlug: slugify(sheetName), rows: [], skipped: 0 };
  }

  // Row 0 = group header (Gold / Silver), Row 1 = column header (Donors, Cells, Addresses)
  const rawGroup = rows[0] || [];
  const rawCol = rows[1] || [];
  const colHeader: string[] = [];
  for (let i = 0; i < rawCol.length; i++) {
    const v = rawCol[i];
    colHeader[i] = v == null ? '' : String(v).toLowerCase();
  }

  // Forward-fill the group header across the FULL column width (xlsx returns sparse arrays
  // with holes for empty cells; .map() skips them, leading to undefined lookups).
  const groups: string[] = [];
  let lastGroup = '';
  for (let i = 0; i < colHeader.length; i++) {
    const raw = rawGroup[i];
    const cur = raw == null ? '' : String(raw).toLowerCase();
    if (cur) lastGroup = cur;
    groups[i] = lastGroup;
  }

  // Find columns
  let cdCol = -1;
  const findCol = (group: 'gold' | 'silver', kind: 'donor' | 'cell' | 'address') => {
    for (let i = 0; i < colHeader.length; i++) {
      if (i === cdCol) continue;
      const h = colHeader[i];
      const g = groups[i] ?? '';
      if (!g.includes(group)) continue;
      if (kind === 'donor' && /donor/.test(h)) return i;
      if (kind === 'cell' && /cell/.test(h)) return i;
      if (kind === 'address' && /address|adress/.test(h)) return i;
    }
    return -1;
  };

  for (let i = 0; i < colHeader.length; i++) {
    if (/^cd$/.test(colHeader[i])) { cdCol = i; break; }
  }
  if (cdCol < 0) cdCol = 0;

  const gd = findCol('gold', 'donor');
  const gc = findCol('gold', 'cell');
  const ga = findCol('gold', 'address');
  const sd = findCol('silver', 'donor');
  const sc = findCol('silver', 'cell');
  const sa = findCol('silver', 'address');

  const out: SheetParseResult['rows'] = [];
  let skipped = 0;
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;
    const parsed = parseCdCell(row[cdCol]);
    if (!parsed) { skipped++; continue; }
    out.push({
      cd_code: parsed.cdCode,
      state_code: parsed.stateCode,
      district_num: parsed.districtNum,
      gold_donors: gd >= 0 ? parseNum(row[gd]) : 0,
      gold_cell_phones: gc >= 0 ? parseNum(row[gc]) : 0,
      gold_addresses: ga >= 0 ? parseNum(row[ga]) : 0,
      silver_donors: sd >= 0 ? parseNum(row[sd]) : 0,
      silver_cell_phones: sc >= 0 ? parseNum(row[sc]) : 0,
      silver_addresses: sa >= 0 ? parseNum(row[sa]) : 0,
    });
  }

  return {
    sheetName,
    issueName: sheetName.replace(/_/g, ' ').trim(),
    issueSlug: slugify(sheetName),
    rows: out,
    skipped,
  };
}

interface ImportSummary {
  issuesCreated: number;
  issuesUpdated: number;
  districtsUpserted: number;
  statesUpserted: number;
  skippedRows: number;
  errors: string[];
}

export function IssueDonorImport() {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'issues' | 'districts' | 'states' | 'done'>('idle');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SheetParseResult[] | null>(null);

  const parseFile = useCallback((file: File): Promise<SheetParseResult[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const sheets = wb.SheetNames.map(name => parseSheet(name, wb.Sheets[name]));
          resolve(sheets);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const sheets = await parseFile(file);
      setPreview(sheets);
      setPendingFile(file);
      setSummary(null);
    } catch (err: any) {
      console.error('[IssueDonorImport] parse error', err);
      toast.error(`Failed to parse file: ${err?.message ?? 'unknown error'}`);
    }
    e.target.value = '';
  };

  const upsertIssue = async (slug: string, name: string): Promise<{ id: string; created: boolean }> => {
    // Try to find existing
    const { data: existing } = await supabase
      .from('issues')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (existing) return { id: existing.id, created: false };

    const { data, error } = await supabase
      .from('issues')
      .insert({ slug, name, is_published: false })
      .select('id')
      .single();
    if (error) throw new Error(`Issue insert failed (${slug}): ${error.message}`);
    return { id: data.id, created: true };
  };

  const aggregateState = (rows: SheetParseResult['rows'], issueId: string) => {
    const m = new Map<string, any>();
    for (const r of rows) {
      const cur = m.get(r.state_code) ?? {
        issue_id: issueId,
        state_code: r.state_code,
        gold_donors: 0, gold_addresses: 0, gold_cell_phones: 0,
        silver_donors: 0, silver_addresses: 0, silver_cell_phones: 0,
        district_count: 0,
      };
      cur.gold_donors += r.gold_donors;
      cur.gold_addresses += r.gold_addresses;
      cur.gold_cell_phones += r.gold_cell_phones;
      cur.silver_donors += r.silver_donors;
      cur.silver_addresses += r.silver_addresses;
      cur.silver_cell_phones += r.silver_cell_phones;
      cur.district_count += 1;
      m.set(r.state_code, cur);
    }
    return Array.from(m.values());
  };

  const confirmImport = async () => {
    if (!pendingFile) return;
    setImporting(true);
    setSummary(null);
    setPreview(null);
    setProgress(0);

    const sum: ImportSummary = {
      issuesCreated: 0, issuesUpdated: 0,
      districtsUpserted: 0, statesUpserted: 0,
      skippedRows: 0, errors: [],
    };

    try {
      setPhase('parsing');
      const sheets = await parseFile(pendingFile);
      const totalSheets = sheets.length;

      for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i];
        if (!sheet.rows.length) {
          sum.errors.push(`Sheet "${sheet.sheetName}" has no parseable district rows`);
          continue;
        }
        sum.skippedRows += sheet.skipped;

        // 1. Upsert issue
        setPhase('issues');
        const { id: issueId, created } = await upsertIssue(sheet.issueSlug, sheet.issueName);
        if (created) sum.issuesCreated++;
        else sum.issuesUpdated++;

        // 2. Upsert districts in chunks, scoped to this issue
        setPhase('districts');
        const records = sheet.rows.map(r => ({ ...r, issue_id: issueId }));
        const CHUNK = 50;
        for (let j = 0; j < records.length; j += CHUNK) {
          const slice = records.slice(j, j + CHUNK);
          const { error } = await supabase
            .from('issue_donor_districts')
            .upsert(slice, { onConflict: 'issue_id,cd_code' });
          if (error) {
            sum.errors.push(`Districts (${sheet.sheetName}) chunk ${j}: ${error.message}`);
          } else {
            sum.districtsUpserted += slice.length;
          }
        }

        // 3. Aggregate + upsert state rollups for this issue
        setPhase('states');
        const stateRows = aggregateState(sheet.rows, issueId);
        for (let j = 0; j < stateRows.length; j += CHUNK) {
          const slice = stateRows.slice(j, j + CHUNK);
          const { error } = await supabase
            .from('issue_donor_states')
            .upsert(slice, { onConflict: 'issue_id,state_code' });
          if (error) {
            sum.errors.push(`States (${sheet.sheetName}) chunk ${j}: ${error.message}`);
          } else {
            sum.statesUpserted += slice.length;
          }
        }

        setProgress(Math.round(((i + 1) / totalSheets) * 100));
      }

      setPhase('done');
      setSummary(sum);
      setPendingFile(null);
      toast.success(`Imported ${sum.districtsUpserted} districts across ${sum.issuesCreated + sum.issuesUpdated} issues`);
    } catch (err: any) {
      sum.errors.push(err.message ?? String(err));
      setSummary(sum);
      setPhase('idle');
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="surgical-glass p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-display flex items-center gap-2">
            <Database className="h-3.5 w-3.5" /> Issue Donor Import
          </h3>
          <p className="text-xs text-muted-foreground mt-2 max-w-md">
            Upload a multi-sheet XLSX where each sheet name is an issue (e.g. <span className="text-foreground">Climate_Change</span>) and each row is a congressional district with Gold / Silver donor counts, addresses, and cell phones. State rollups are computed automatically.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors rounded-sm cursor-pointer shrink-0">
          <Upload className="h-3 w-3" />
          Choose File
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFile}
            disabled={importing}
          />
        </label>
      </div>

      {preview && !importing && (
        <div className="border border-white/5 rounded-sm overflow-hidden">
          <div className="bg-[#1c1c1e] px-4 py-2 flex items-center justify-between">
            <p className="text-xs text-foreground font-medium flex items-center gap-2">
              <FileSpreadsheet className="h-3.5 w-3.5 text-blue-400" />
              {preview.length} sheet{preview.length === 1 ? '' : 's'} detected
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setPreview(null); setPendingFile(null); }}
                className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] bg-blue-600 text-white hover:bg-blue-700 rounded-sm"
              >
                Confirm Import
              </button>
            </div>
          </div>
          <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
            {preview.map(sheet => (
              <div key={sheet.sheetName} className="px-4 py-2 flex items-center justify-between text-xs">
                <div>
                  <span className="text-foreground font-medium">{sheet.issueName}</span>
                  <span className="text-muted-foreground ml-2 font-mono">[{sheet.issueSlug}]</span>
                </div>
                <div className="text-muted-foreground tabular-nums">
                  {sheet.rows.length} districts
                  {sheet.skipped > 0 && <span className="ml-2 text-amber-400">({sheet.skipped} skipped)</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {importing && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="capitalize">{phase}…</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {summary && !importing && (
        <div className="border border-white/5 rounded-sm p-4 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <CheckCircle className="h-4 w-4" /> Import complete
          </div>
          <ul className="text-muted-foreground space-y-1">
            <li>{summary.issuesCreated} issues created, {summary.issuesUpdated} reused</li>
            <li>{summary.districtsUpserted} district rows upserted</li>
            <li>{summary.statesUpserted} state rows upserted</li>
            {summary.skippedRows > 0 && <li className="text-amber-400">{summary.skippedRows} rows skipped (non-CD or totals)</li>}
          </ul>
          {summary.errors.length > 0 && (
            <div className="mt-2 text-rose-400 space-y-1">
              <div className="flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5" /> Errors:</div>
              <ul className="pl-4 list-disc">
                {summary.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
