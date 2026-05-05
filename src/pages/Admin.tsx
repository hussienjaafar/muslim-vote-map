import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

export default function Admin() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);

  if (loading) return <div className="flex items-center justify-center h-screen bg-background text-foreground">Loading...</div>;
  if (!user || !isAdmin) return (
    <div className="flex items-center justify-center h-screen bg-background text-foreground">
      <p>Access denied. Admin role required.</p>
    </div>
  );

  const handleStatesImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      
      for (const row of rows) {
        const { error } = await supabase.from('voter_impact_states').upsert({
          state_code: row.state_code || row.State_Code,
          state_name: row.state_name || row.State_Name || row.State,
          muslim_voters: Number(row.muslim_voters || row.Muslim_Voters || 0),
          households: Number(row.households || row.Households || 0),
          cell_phones: Number(row.cell_phones || row.Cell_Phones || 0),
          registered: Number(row.registered || row.Registered || 0),
          registered_pct: Number(row.registered_pct || row.Registered_Pct || 0),
          vote_2024: Number(row.vote_2024 || row.Vote_2024 || 0),
          vote_2024_pct: Number(row.vote_2024_pct || row.Vote_2024_Pct || 0),
          vote_2022: Number(row.vote_2022 || row.Vote_2022 || 0),
          vote_2022_pct: Number(row.vote_2022_pct || row.Vote_2022_Pct || 0),
          political_donors: Number(row.political_donors || row.Political_Donors || 0),
          political_activists: Number(row.political_activists || row.Political_Activists || 0),
        }, { onConflict: 'state_code' });
        if (error) throw error;
      }
      toast.success(`Imported ${rows.length} states`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleDistrictsImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      
      for (const row of rows) {
        const { error } = await supabase.from('voter_impact_districts').upsert({
          cd_code: row.cd_code || row.CD_Code,
          state_code: row.state_code || row.State_Code,
          district_num: Number(row.district_num || row.District_Num || 0),
          winner: row.winner || row.Winner || null,
          winner_party: row.winner_party || row.Winner_Party || null,
          winner_votes: Number(row.winner_votes || row.Winner_Votes || 0) || null,
          runner_up: row.runner_up || row.Runner_Up || null,
          runner_up_party: row.runner_up_party || row.Runner_Up_Party || null,
          runner_up_votes: Number(row.runner_up_votes || row.Runner_Up_Votes || 0) || null,
          margin_votes: Number(row.margin_votes || row.Margin_Votes || 0) || null,
          margin_pct: Number(row.margin_pct || row.Margin_Pct || 0) || null,
          total_votes: Number(row.total_votes || row.Total_Votes || 0) || null,
          muslim_voters: Number(row.muslim_voters || row.Muslim_Voters || 0),
          muslim_registered: Number(row.muslim_registered || row.Muslim_Registered || 0),
          muslim_unregistered: Number(row.muslim_unregistered || row.Muslim_Unregistered || 0),
          voted_2024: Number(row.voted_2024 || row.Voted_2024 || 0),
          didnt_vote_2024: Number(row.didnt_vote_2024 || row.Didnt_Vote_2024 || 0),
          actual_turnout_pct: Number(row.actual_turnout_pct || row.Actual_Turnout_Pct || row.turnout_pct || row.Turnout_Pct || 0),
          turnout_pct: null, // Clear stale legacy field
          can_impact: row.can_impact === true || row.can_impact === 'true' || row.Can_Impact === true || row.Can_Impact === 'true',
          votes_needed: Number(row.votes_needed || row.Votes_Needed || 0) || null,
          cost_estimate: Number(row.cost_estimate || row.Cost_Estimate || 0) || null,
          cell_phones: Number(row.cell_phones || row.Cell_Phones || 0),
          households: Number(row.households || row.Households || 0),
          political_activists: Number(row.political_activists || row.Political_Activists || row.Activists || 0),
          donor_platinum_count: Number(row.donor_platinum_count || row.Donor_Platinum_Count || row.Donors || 0),
        }, { onConflict: 'cd_code' });
        if (error) throw error;
      }
      toast.success(`Imported ${rows.length} districts`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Admin: Data Import</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Import States Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Upload an Excel file with columns: state_code, state_name, muslim_voters, households, cell_phones, registered, registered_pct, vote_2024, vote_2024_pct, vote_2022, vote_2022_pct, political_donors, political_activists</p>
            <Label htmlFor="states-file">Excel File (.xlsx)</Label>
            <Input id="states-file" type="file" accept=".xlsx,.xls" onChange={handleStatesImport} disabled={importing} className="mt-1" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Import Districts Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Upload an Excel file with district-level voter data columns matching the schema.</p>
            <Label htmlFor="districts-file">Excel File (.xlsx)</Label>
            <Input id="districts-file" type="file" accept=".xlsx,.xls" onChange={handleDistrictsImport} disabled={importing} className="mt-1" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
