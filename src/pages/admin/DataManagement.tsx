import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ElectionResultsImport } from '@/components/admin/ElectionResultsImport';
import { IssueDonorImport } from '@/components/admin/IssueDonorImport';

function useStates() {
  return useQuery({
    queryKey: ['admin-states'],
    queryFn: async () => {
      const { data, error } = await supabase.from('voter_impact_states').select('*').order('state_name');
      if (error) throw error;
      return data;
    },
  });
}

function useDistricts(stateFilter?: string) {
  return useQuery({
    queryKey: ['admin-districts', stateFilter],
    queryFn: async () => {
      let q = supabase.from('voter_impact_districts').select('*').order('cd_code');
      if (stateFilter) q = q.eq('state_code', stateFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

function exportCsv(data: Record<string, any>[], filename: string) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const header = keys.join(',') + '\n';
  const rows = data.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(',')).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const TABS = [
  { key: 'states', label: 'States' },
  { key: 'districts', label: 'Districts' },
  { key: 'import', label: 'Import' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function DataManagement() {
  const qc = useQueryClient();
  const { data: states, isLoading: statesLoading } = useStates();
  const [stateFilter, setStateFilter] = useState('');
  const { data: districts, isLoading: districtsLoading } = useDistricts(stateFilter || undefined);
  const [activeTab, setActiveTab] = useState<TabKey>('states');

  const deleteAll = async (table: 'voter_impact_states' | 'voter_impact_districts') => {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: table === 'voter_impact_states' ? ['admin-states'] : ['admin-districts'] });
    toast.success(`All ${table === 'voter_impact_states' ? 'state' : 'district'} data deleted`);
  };

  const tabLabel = (key: TabKey) => {
    if (key === 'states') return `States (${states?.length ?? 0})`;
    if (key === 'districts') return `Districts (${districts?.length ?? 0})`;
    return 'Import';
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-foreground tracking-tight">Data Management</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">Election context data (winner, margin, turnout) used by the Issue Map. Issue donor data is uploaded from the Map page.</p>
      </div>

      {/* Surgical tabs */}
      <div className="flex gap-1 bg-[#1c1c1e]/80 backdrop-blur-[20px] rounded-lg border border-[rgba(255,255,255,0.08)] p-1 w-fit max-w-full overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 sm:px-4 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 text-[10px] font-bold uppercase tracking-[0.15em] rounded-sm transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-[#2a2a2a] text-blue-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tabLabel(tab.key)}
          </button>
        ))}
      </div>

      <Tabs value={activeTab}>
        {/* States Tab */}
        <TabsContent value="states">
          <div className="surgical-glass">
            {/* Actions bar */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-display">State Data</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => states && exportCsv(states, 'states.csv')}
                  disabled={!states?.length}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] border border-[rgba(255,255,255,0.08)] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors rounded-sm disabled:opacity-40"
                >
                  <Download className="h-3 w-3" /> Export
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      disabled={!states?.length}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-red-400 hover:bg-red-600/10 transition-colors rounded-sm disabled:opacity-40"
                    >
                      <Trash2 className="h-3 w-3" /> Reset
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-[#1c1c1e] border-[rgba(255,255,255,0.08)]">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-display text-foreground">Delete all state data?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently remove all {states?.length} state records. You'll need to re-import.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-[rgba(255,255,255,0.08)] text-muted-foreground hover:bg-white/5">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteAll('voter_impact_states')} className="bg-red-600 text-white hover:bg-red-700">Delete All</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {statesLoading ? (
              <div className="py-12 text-center"><p className="text-sm text-muted-foreground">Loading...</p></div>
            ) : (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-white/5 hover:bg-transparent">
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">State</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Code</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Muslim Voters</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Registered</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Households</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Voted 2024</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {states?.map(s => (
                      <TableRow key={s.id} className="border-b border-white/5 hover:bg-[#1c1c1e] transition-colors">
                        <TableCell className="font-medium text-foreground">{s.state_name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{s.state_code}</TableCell>
                        <TableCell className="tabular-nums">{s.muslim_voters.toLocaleString()}</TableCell>
                        <TableCell className="tabular-nums">{(s.registered ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="tabular-nums">{(s.households ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="tabular-nums">{(s.vote_2024 ?? 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Districts Tab */}
        <TabsContent value="districts">
          <div className="surgical-glass">
            {/* Actions bar */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-display">District Data</h3>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Filter by state..."
                  value={stateFilter}
                  onChange={e => setStateFilter(e.target.value.toUpperCase())}
                  className="w-36 h-7 text-xs bg-[#2c2c2e] border-[rgba(255,255,255,0.08)]"
                />
                <button
                  onClick={() => districts && exportCsv(districts, 'districts.csv')}
                  disabled={!districts?.length}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] border border-[rgba(255,255,255,0.08)] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors rounded-sm disabled:opacity-40"
                >
                  <Download className="h-3 w-3" /> Export
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      disabled={!districts?.length}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-red-400 hover:bg-red-600/10 transition-colors rounded-sm disabled:opacity-40"
                    >
                      <Trash2 className="h-3 w-3" /> Reset
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-[#1c1c1e] border-[rgba(255,255,255,0.08)]">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-display text-foreground">Delete all district data?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently remove all district records.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-[rgba(255,255,255,0.08)] text-muted-foreground hover:bg-white/5">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteAll('voter_impact_districts')} className="bg-red-600 text-white hover:bg-red-700">Delete All</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {districtsLoading ? (
              <div className="py-12 text-center"><p className="text-sm text-muted-foreground">Loading...</p></div>
            ) : (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-white/5 hover:bg-transparent">
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">CD Code</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">State</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">District</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Muslim Voters</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Winner</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Margin</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Can Impact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {districts?.map(d => (
                      <TableRow key={d.id} className="border-b border-white/5 hover:bg-[#1c1c1e] transition-colors">
                        <TableCell className="font-mono text-xs text-muted-foreground">{d.cd_code}</TableCell>
                        <TableCell className="text-foreground">{d.state_code}</TableCell>
                        <TableCell className="text-muted-foreground">{d.district_num}</TableCell>
                        <TableCell className="tabular-nums">{d.muslim_voters.toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{d.winner ?? '—'} <span className="text-muted-foreground">({d.winner_party ?? ''})</span></TableCell>
                        <TableCell className="tabular-nums">{d.margin_votes?.toLocaleString() ?? '—'}</TableCell>
                        <TableCell>
                          {d.can_impact ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Yes</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Import Tab */}
        <TabsContent value="import">
          <div className="space-y-8">
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-display mb-3">Election Results</h3>
              <ElectionResultsImport />
            </section>
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-display mb-3">Issue Donor Data (Congressional Districts)</h3>
              <p className="text-xs text-muted-foreground mb-3">Upload a multi-sheet XLSX file. Each sheet becomes an issue with district- and state-level donor data.</p>
              <IssueDonorImport />
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
