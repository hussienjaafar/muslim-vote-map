import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Vote, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

function cleanNum(val: any): number | null {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Math.round(val);
  const s = String(val).replace(/[,\\s$]/g, '').trim();
  if (!s || /^[-–—]+$/.test(s)) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n);
}

function cleanPct(val: any): number | null {
  if (val == null || val === '') return null;
  if (typeof val === 'number') {
    const v = (val > 0 && val <= 1) ? val * 100 : val;
    return Math.round(v * 10) / 10;
  }
  const s = String(val).replace(/[,\\s%]/g, '').trim();
  if (!s || /^[-–—]+$/.test(s)) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 10) / 10;
}

function normalizeCdCode(raw: string): string | null {
  const s = raw.trim();
  const atLarge = s.match(/^([A-Z]{2})-At-large$/i);
  if (atLarge) return `${atLarge[1].toUpperCase()}-001`;
  const standard = s.match(/^([A-Z]{2})-(\d+)$/i);
  if (standard) return `${standard[1].toUpperCase()}-${standard[2].padStart(3, '0')}`;
  return null;
}

interface ParsedRow {
  cd_code: string;
  winner: string | null;
  winner_party: string | null;
  winner_votes: number | null;
  runner_up: string | null;
  runner_up_party: string | null;
  runner_up_votes: number | null;
  margin_votes: number | null;
  margin_pct: number | null;
  total_votes: number | null;
}

export function ElectionResultsImport() {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [allParsed, setAllParsed] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<{ success: number; errors: number; impactUpdated: number; messages: string[] } | null>(null);

  const parseFile = useCallback(async (file: File): Promise<any[]> => {
    const data = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(data, { type: 'array' });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  }, []);

  const parseRows = (rows: any[]): ParsedRow[] => {
    const seen = new Map<string, ParsedRow>();

    for (const row of rows) {
      const cdCode = normalizeCdCode(String(row['CD_CODE'] || row['cd_code'] || ''));
      if (!cdCode) continue;

      const electionType = String(row['Election Type'] || row[' Election Type '] || '').trim().toLowerCase();

      const parsed: ParsedRow = {
        cd_code: cdCode,
        winner: String(row['WINNER'] || row['Winner'] || '').trim() || null,
        winner_party: String(row['Party'] || row['party'] || '').trim() || null,
        winner_votes: cleanNum(row['Votes'] || row['votes']),
        runner_up: String(row['Runner-Up'] || row['runner_up'] || '').trim() || null,
        runner_up_party: String(row['Runner-Up Party'] || row['runner_up_party'] || '').trim() || null,
        runner_up_votes: cleanNum(row[' Runner-Up Votes '] || row['Runner-Up Votes'] || row['runner_up_votes']),
        margin_votes: cleanNum(row[' Margin (Votes) '] || row['Margin (Votes)'] || row['margin_votes']),
        margin_pct: cleanPct(row['Margin (%)'] || row['margin_pct']),
        total_votes: cleanNum(row[' Total Votes '] || row['Total Votes'] || row['total_votes']),
      };

      if (parsed.runner_up === '') parsed.runner_up = null;
      if (parsed.runner_up_party === '') parsed.runner_up_party = null;

      if (seen.has(cdCode)) {
        if (electionType === 'special') continue;
      }
      seen.set(cdCode, parsed);
    }

    return Array.from(seen.values());
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseFile(file);
      const parsed = parseRows(rows);
      setAllParsed(parsed);
      setPreview(parsed.slice(0, 8));
      setResult(null);
    } catch {
      toast.error('Failed to parse file');
    }
    e.target.value = '';
  };

  const confirmImport = async () => {
    if (!allParsed.length) return;
    setImporting(true);
    setResult(null);
    setPreview(null);

    const res = { success: 0, errors: 0, impactUpdated: 0, messages: [] as string[] };
    const CHUNK = 50;

    try {
      for (let i = 0; i < allParsed.length; i += CHUNK) {
        const chunk = allParsed.slice(i, i + CHUNK);
        const { error } = await supabase
          .from('voter_impact_districts')
          .upsert(
            chunk.map(r => ({
              cd_code: r.cd_code,
              state_code: r.cd_code.substring(0, 2),
              district_num: parseInt(r.cd_code.substring(3), 10),
              winner: r.winner,
              winner_party: r.winner_party,
              winner_votes: r.winner_votes,
              runner_up: r.runner_up,
              runner_up_party: r.runner_up_party,
              runner_up_votes: r.runner_up_votes,
              margin_votes: r.margin_votes,
              margin_pct: r.margin_pct,
              total_votes: r.total_votes,
              muslim_voters: 0,
            })),
            { onConflict: 'cd_code', ignoreDuplicates: false }
          );
        if (error) {
          res.errors += chunk.length;
          res.messages.push(`Chunk error: ${error.message}`);
        } else {
          res.success += chunk.length;
        }
        setProgress(Math.round(((i + CHUNK) / allParsed.length) * 80));
      }

      if (res.errors === 0) {
        setProgress(85);
        const { data: districts } = await supabase
          .from('voter_impact_districts')
          .select('cd_code, margin_votes, muslim_voters, muslim_registered, didnt_vote_2024');

        if (districts) {
          const updates: { cd_code: string; can_impact: boolean; votes_needed: number | null }[] = [];
          for (const d of districts) {
            const margin = Math.abs(d.margin_votes ?? 0);
            const potential = (d.muslim_registered ?? d.muslim_voters ?? 0);
            const canImpact = margin > 0 && potential >= margin;
            updates.push({
              cd_code: d.cd_code,
              can_impact: canImpact,
              votes_needed: canImpact ? margin : null,
            });
          }

          for (let i = 0; i < updates.length; i += CHUNK) {
            const chunk = updates.slice(i, i + CHUNK);
            for (const u of chunk) {
              await supabase
                .from('voter_impact_districts')
                .update({ can_impact: u.can_impact, votes_needed: u.votes_needed })
                .eq('cd_code', u.cd_code);
            }
          }
          res.impactUpdated = updates.filter(u => u.can_impact).length;
          setProgress(100);
        }
      }
    } catch (err: any) {
      res.messages.push(err.message);
    }

    setImporting(false);
    setResult(res);
    setAllParsed([]);

    if (res.errors === 0) {
      toast.success(`Imported ${res.success} election results, ${res.impactUpdated} impact districts flagged`);
    } else {
      toast.error(`Import completed with ${res.errors} errors`);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-display">
            <Vote className="w-5 h-5" />
            Import Election Results
          </CardTitle>
          <CardDescription>
            Upload 2024 House election results (CSV/XLSX). Updates winner, runner-up, margins, and recalculates impact districts.
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
                <Loader2 className="w-3 h-3 animate-spin" />
                {progress < 80 ? 'Importing election results…' : 'Recalculating impact districts…'}
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {result && (
            <div className="space-y-1 text-sm">
              {result.errors === 0 ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">
                    {result.success} results imported, {result.impactUpdated} impact districts flagged
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400">{result.errors} errors</span>
                </div>
              )}
              {result.messages.map((m, i) => (
                <p key={i} className="text-xs text-muted-foreground">{m}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-display">Preview ({allParsed.length} districts parsed)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left text-muted-foreground font-medium border-b border-white/5">CD Code</th>
                    <th className="px-2 py-1 text-left text-muted-foreground font-medium border-b border-white/5">Winner</th>
                    <th className="px-2 py-1 text-left text-muted-foreground font-medium border-b border-white/5">Party</th>
                    <th className="px-2 py-1 text-left text-muted-foreground font-medium border-b border-white/5">Votes</th>
                    <th className="px-2 py-1 text-left text-muted-foreground font-medium border-b border-white/5">Runner-Up</th>
                    <th className="px-2 py-1 text-left text-muted-foreground font-medium border-b border-white/5">R-Up Party</th>
                    <th className="px-2 py-1 text-left text-muted-foreground font-medium border-b border-white/5">Margin</th>
                    <th className="px-2 py-1 text-left text-muted-foreground font-medium border-b border-white/5">Margin %</th>
                    <th className="px-2 py-1 text-left text-muted-foreground font-medium border-b border-white/5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 border-b border-white/5 font-mono text-foreground">{r.cd_code}</td>
                      <td className="px-2 py-1 border-b border-white/5 text-foreground">{r.winner ?? '—'}</td>
                      <td className="px-2 py-1 border-b border-white/5 text-foreground">{r.winner_party ?? '—'}</td>
                      <td className="px-2 py-1 border-b border-white/5 tabular-nums">{r.winner_votes?.toLocaleString() ?? '—'}</td>
                      <td className="px-2 py-1 border-b border-white/5 text-foreground">{r.runner_up ?? '—'}</td>
                      <td className="px-2 py-1 border-b border-white/5 text-foreground">{r.runner_up_party ?? '—'}</td>
                      <td className="px-2 py-1 border-b border-white/5 tabular-nums">{r.margin_votes?.toLocaleString() ?? '—'}</td>
                      <td className="px-2 py-1 border-b border-white/5 tabular-nums">{r.margin_pct != null ? `${r.margin_pct}%` : '—'}</td>
                      <td className="px-2 py-1 border-b border-white/5 tabular-nums">{r.total_votes?.toLocaleString() ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={confirmImport} className="bg-blue-600 hover:bg-blue-700 text-white">
                Confirm Import ({allParsed.length} districts)
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setPreview(null); setAllParsed([]); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
