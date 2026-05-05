import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { STATE_ABBREVIATIONS, isValidStateAbbreviation } from '@/lib/us-states';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

function normalizeKey(key: string): string {
  return key.replace(/[\s_\-\.]/g, '').toLowerCase();
}

function parseNumber(val: any): number | null {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Math.round(val);
  const str = String(val).trim();
  if (/^[-–—]+$/.test(str)) return null;
  const n = parseFloat(str.replace(/[,\s$%]/g, ''));
  return isNaN(n) ? null : Math.round(n);
}

function parsePercent(val: any): number | null {
  if (val == null || val === '') return null;
  if (typeof val === 'number') {
    // XLSX.js parses "91%" as 0.91 (Excel stores percentages as 0-1 decimals)
    // Detect and convert: values > 0 and <= 1 are likely decimal percentages
    const adjusted = (val > 0 && val <= 1) ? val * 100 : val;
    return Math.min(Math.round(adjusted * 10) / 10, 100);
  }
  const str = String(val).trim();
  if (/^[-–—]+$/.test(str)) return null;
  const n = parseFloat(str.replace(/[,\s$%]/g, ''));
  return isNaN(n) ? null : Math.min(Math.round(n * 10) / 10, 100);
}

function findColumn(headers: Record<string, string>, ...candidates: string[]): string | null {
  for (const c of candidates) {
    const norm = normalizeKey(c);
    if (headers[norm]) return headers[norm];
  }
  return null;
}

interface ImportResult {
  districtSuccess: number;
  districtErrors: number;
  statesAggregated: number;
  messages: string[];
}

export function VoterImpactDataImport() {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'districts' | 'aggregating' | 'done'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const parseFile = useCallback((file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet);
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseFile(file);
      setPreviewData(rows.slice(0, 5));
      setPendingFile(file);
    } catch {
      toast.error('Failed to parse file');
    }
    e.target.value = '';
  };

  const aggregateStates = async (): Promise<number> => {
    // Fetch all districts to aggregate
    const { data: allDistricts, error } = await supabase
      .from('voter_impact_districts')
      .select('state_code, muslim_voters, muslim_registered, muslim_unregistered, cell_phones, households, political_activists, political_donors, donor_gold_count, donor_silver_count, voted_2024, actual_turnout_pct, voted_2022, turnout_2022_pct, primary_2024, primary_2024_pct, primary_2022, primary_2022_pct, registration_pct');

    if (error || !allDistricts) throw new Error(`Failed to fetch districts: ${error?.message}`);

    // Group by state
    const stateMap = new Map<string, typeof allDistricts>();
    for (const d of allDistricts) {
      const arr = stateMap.get(d.state_code) || [];
      arr.push(d);
      stateMap.set(d.state_code, arr);
    }

    const stateRecords: any[] = [];
    for (const [stateCode, districts] of stateMap) {
      const stateName = STATE_ABBREVIATIONS[stateCode] || stateCode;

      const sum = (field: string) => districts.reduce((acc, d) => acc + ((d as any)[field] ?? 0), 0);
      const sumOrNull = (field: string) => {
        const vals = districts.map(d => (d as any)[field]).filter(v => v != null && v > 0);
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
      };

      const voters = sum('muslim_voters');
      const registered = sumOrNull('muslim_registered') ?? 0;
      const voted2024 = sumOrNull('voted_2024');
      const voted2022 = sumOrNull('voted_2022');
      const primary2024 = sumOrNull('primary_2024');
      const primary2022 = sumOrNull('primary_2022');

      const safePct = (num: number | null, denom: number) =>
        num != null && denom > 0 ? Math.min(Math.round((num / denom) * 1000) / 10, 100) : null;

      stateRecords.push({
        state_code: stateCode,
        state_name: stateName,
        muslim_voters: voters,
        registered: registered > 0 ? registered : null,
        registered_pct: safePct(registered, voters),
        cell_phones: sumOrNull('cell_phones'),
        households: sumOrNull('households'),
        political_activists: sumOrNull('political_activists'),
        political_donors: ((sumOrNull('donor_gold_count') ?? 0) + (sumOrNull('donor_silver_count') ?? 0)) || sumOrNull('political_donors'),
        donor_gold_count: sumOrNull('donor_gold_count'),
        donor_silver_count: sumOrNull('donor_silver_count'),
        vote_2024: voted2024,
        vote_2024_pct: safePct(voted2024, registered),
        vote_2022: voted2022,
        vote_2022_pct: safePct(voted2022, registered),
        primary_2024: primary2024,
        primary_2024_pct: safePct(primary2024, registered),
        primary_2022: primary2022,
        primary_2022_pct: safePct(primary2022, registered),
      });
    }

    // Upsert in chunks
    const CHUNK = 25;
    let successCount = 0;
    for (let i = 0; i < stateRecords.length; i += CHUNK) {
      const chunk = stateRecords.slice(i, i + CHUNK);
      const { error: upsertError } = await supabase
        .from('voter_impact_states')
        .upsert(chunk, { onConflict: 'state_code' });
      if (upsertError) throw new Error(`State upsert error: ${upsertError.message}`);
      successCount += chunk.length;
    }

    return successCount;
  };

  const confirmImport = async () => {
    if (!pendingFile) return;
    setImporting(true);
    setResult(null);
    setPreviewData(null);
    setPhase('districts');

    const result: ImportResult = { districtSuccess: 0, districtErrors: 0, statesAggregated: 0, messages: [] };

    try {
      const rows = await parseFile(pendingFile);
      if (!rows.length) throw new Error('No data found');

      const rawHeaders = Object.keys(rows[0]);
      const headerMap: Record<string, string> = {};
      rawHeaders.forEach(h => { headerMap[normalizeKey(h)] = h; });

      const CHUNK = 50;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const records = chunk.map((row: any) => {
          const cdColName = findColumn(headerMap, 'cd', 'cd_code', 'cdcode') || '';
          const cdRaw = row[cdColName] || '';

          // Skip N/A rows (unassigned voters)
          const cdStr = String(cdRaw).trim().toUpperCase();
          if (cdStr === 'N/A' || cdStr === 'N' || cdStr === '') return null;

          let stateCode = '';
          let districtNum = 0;
          let cdCode = '';

          const cdMatch = cdStr.match(/^([A-Z]{2})\s*\/\s*(\d+)$/);
          if (cdMatch) {
            stateCode = cdMatch[1];
            districtNum = parseInt(cdMatch[2], 10);
            cdCode = `${stateCode}-${String(districtNum).padStart(3, '0')}`;
          } else if (/^[A-Z]{2}$/.test(cdStr)) {
            // Two-column format: CD col has state code, next col has district number
            stateCode = cdStr;
            // Try named column first, then grab the value from the column immediately after CD
            const distCol = findColumn(headerMap, 'district_num', 'districtnum', 'district');
            if (distCol) {
              districtNum = parseNumber(row[distCol]) ?? 0;
            } else {
              // Find the key right after the CD column in the raw headers
              const cdIdx = rawHeaders.indexOf(cdColName);
              if (cdIdx >= 0 && cdIdx + 1 < rawHeaders.length) {
                districtNum = parseNumber(row[rawHeaders[cdIdx + 1]]) ?? 0;
              }
            }
            cdCode = `${stateCode}-${String(districtNum).padStart(3, '0')}`;
          } else {
            stateCode = (row[findColumn(headerMap, 'state_code', 'statecode', 'state') || ''] || '').toUpperCase();
            districtNum = parseNumber(row[findColumn(headerMap, 'district_num', 'districtnum', 'district') || '']) ?? 0;
            cdCode = `${stateCode}-${String(districtNum).padStart(3, '0')}`;
          }

          const rawMuslimVoters = parseNumber(row[findColumn(headerMap, 'muslim_voters', 'muslimvoters', 'voters') || '']) ?? 0;
          const registered = parseNumber(row[findColumn(headerMap, 'muslim_registered', 'muslimregistered', 'registered') || '']);
          // Ensure muslim_voters is populated — fallback to registered count
          const muslimVoters = rawMuslimVoters > 0 ? rawMuslimVoters : (registered ?? 0);
          const voted2024 = parseNumber(row[findColumn(headerMap, 'voted_2024', 'voted2024', 'general2024') || '']);
          const rawDonors = parseNumber(row[findColumn(headerMap, 'political_donors', 'politicaldonors', 'donors') || '']);
          // If donors === voters, the CSV column is a duplicate — store null to avoid bad data
          const politicalDonors = (rawDonors != null && rawDonors === muslimVoters) ? null : rawDonors;

          return {
            cd_code: cdCode,
            state_code: stateCode,
            district_num: districtNum,
            muslim_voters: muslimVoters,
            muslim_registered: registered,
            muslim_unregistered: parseNumber(row[findColumn(headerMap, 'muslim_unregistered', 'muslimunregistered', 'unregistered') || '']),
            voted_2024: voted2024,
            didnt_vote_2024: (registered != null && voted2024 != null) ? Math.max(0, registered - voted2024) : null,
            registration_pct: parsePercent(row[findColumn(headerMap, 'registration_pct', 'registrationpct', 'voterreg%') || '']),
            actual_turnout_pct: parsePercent(row[findColumn(headerMap, 'actual_turnout_pct', 'actualturnoutpct', 'turnout2024g') || '']),
            turnout_pct: null, // Clear stale data
            voted_2022: parseNumber(row[findColumn(headerMap, 'voted_2022', 'voted2022', 'general2022') || '']),
            turnout_2022_pct: parsePercent(row[findColumn(headerMap, 'turnout_2022_pct', 'turnout2022pct', 'turnout2022g') || '']),
            primary_2024: parseNumber(row[findColumn(headerMap, 'primary_2024', 'primary2024') || '']),
            primary_2024_pct: parsePercent(row[findColumn(headerMap, 'primary_2024_pct', 'primary2024pct', 'turnout2024p') || '']),
            primary_2022: parseNumber(row[findColumn(headerMap, 'primary_2022', 'primary2022') || '']),
            primary_2022_pct: parsePercent(row[findColumn(headerMap, 'primary_2022_pct', 'primary2022pct', 'turnout2022p') || '']),
            cell_phones: parseNumber(row[findColumn(headerMap, 'cell_phones', 'cellphones', 'cells') || '']),
            households: parseNumber(row[findColumn(headerMap, 'households') || '']),
            political_activists: parseNumber(row[findColumn(headerMap, 'political_activists', 'politicalactivists', 'activists') || '']),
            political_donors: politicalDonors,
            donor_gold_count: parseNumber(row[findColumn(headerMap, 'donor_gold_count', 'donorgoldcount', 'golddonors') || '']),
            donor_silver_count: parseNumber(row[findColumn(headerMap, 'donor_silver_count', 'donorsilvercount', 'silverdonors') || '']),
            // Election result fields (from separate data, not in this CSV)
            total_votes: parseNumber(row[findColumn(headerMap, 'total_votes', 'totalvotes') || '']),
            winner: row[findColumn(headerMap, 'winner') || ''] || null,
            winner_party: row[findColumn(headerMap, 'winner_party', 'winnerparty') || ''] || null,
            winner_votes: parseNumber(row[findColumn(headerMap, 'winner_votes', 'winnervotes') || '']),
            runner_up: row[findColumn(headerMap, 'runner_up', 'runnerup') || ''] || null,
            runner_up_party: row[findColumn(headerMap, 'runner_up_party', 'runnerupparty') || ''] || null,
            runner_up_votes: parseNumber(row[findColumn(headerMap, 'runner_up_votes', 'runnerupvotes') || '']),
            margin_votes: parseNumber(row[findColumn(headerMap, 'margin_votes', 'marginvotes') || '']),
            margin_pct: parsePercent(row[findColumn(headerMap, 'margin_pct', 'marginpct') || '']),
            can_impact: false,
            votes_needed: null,
            cost_estimate: null,
          };
        }).filter((r): r is NonNullable<typeof r> => r != null && !!r.cd_code && !!r.state_code);

        const { error } = await supabase
          .from('voter_impact_districts')
          .upsert(records, { onConflict: 'cd_code' });

        if (error) {
          result.districtErrors += records.length;
          result.messages.push(`Chunk error: ${error.message}`);
        } else {
          result.districtSuccess += records.length;
        }
        setProgress(Math.round(((i + CHUNK) / rows.length) * 100));
      }

      // Phase 2: Auto-aggregate state data
      if (result.districtErrors === 0) {
        setPhase('aggregating');
        setProgress(0);
        result.statesAggregated = await aggregateStates();
      }

    } catch (err: any) {
      result.messages.push(err.message);
    }

    setImporting(false);
    setPhase('done');
    setResult(result);
    setPendingFile(null);

    if (result.districtErrors === 0) {
      toast.success(`Imported ${result.districtSuccess} districts, aggregated ${result.statesAggregated} states`);
    } else {
      toast.error(`Import completed with ${result.districtErrors} errors`);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-display">
            <FileSpreadsheet className="w-5 h-5" />
            Import Voter Data
          </CardTitle>
          <CardDescription>
            Upload district-level CSV/XLSX. State totals are automatically computed from district data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" disabled={importing} />
            <Button variant="outline" size="sm" asChild disabled={importing}>
              <span><Upload className="w-4 h-4 mr-1" />Choose File</span>
            </Button>
          </label>

          {importing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {phase === 'districts' && <><Loader2 className="w-3 h-3 animate-spin" />Importing districts…</>}
                {phase === 'aggregating' && <><Database className="w-3 h-3 animate-pulse" />Aggregating state data…</>}
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {result && (
            <div className="space-y-1 text-sm">
              {result.districtErrors === 0 ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">
                    {result.districtSuccess} districts imported, {result.statesAggregated} states aggregated
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400">{result.districtErrors} errors</span>
                </div>
              )}
              {result.messages.map((m, i) => (
                <p key={i} className="text-xs text-muted-foreground">{m}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Table */}
      {previewData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-display">Preview (first 5 rows)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr>
                    {Object.keys(previewData[0] || {}).map(k => (
                      <th key={k} className="px-2 py-1 text-left text-muted-foreground font-medium border-b border-white/5">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v: any, j) => (
                        <td key={j} className="px-2 py-1 border-b border-white/5 text-foreground">{String(v ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={confirmImport} className="bg-blue-600 hover:bg-blue-700 text-white">
                Confirm Import
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setPreviewData(null); setPendingFile(null); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
