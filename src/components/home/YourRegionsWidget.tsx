import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, MapPin, Users, Vote, TrendingUp } from 'lucide-react';
import { useStatesData, useAllDistricts } from '@/hooks/useVoterData';

interface SavedRegion {
  id: string;
  region_code: string;
  region_type: string;
  region_name: string | null;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

export function YourRegionsWidget({ regions }: { regions: SavedRegion[] }) {
  const navigate = useNavigate();
  const { data: statesData } = useStatesData();
  const { data: districtsData } = useAllDistricts();

  const enriched = useMemo(() => {
    if (!regions.length) return [];
    return regions.map(region => {
      let voters = 0;
      let regRate: number | null = null;
      let turnout: number | null = null;

      if (region.region_type === 'state' && statesData) {
        const state = statesData.find(s => s.state_code === region.region_code);
        if (state) {
          voters = state.muslim_voters;
          regRate = Number(state.registered_pct ?? 0);
          turnout = state.vote_2024_pct != null ? Number(state.vote_2024_pct) : null;
        }
      } else if (region.region_type === 'district' && districtsData) {
        const district = districtsData.find(d => d.cd_code === region.region_code);
        if (district) {
          voters = district.muslim_voters;
          regRate = district.registration_pct != null ? Number(district.registration_pct) : null;
          turnout = district.actual_turnout_pct != null ? Number(district.actual_turnout_pct) : null;
        }
      }

      return { ...region, voters, regRate, turnout };
    });
  }, [regions, statesData, districtsData]);

  if (!regions.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Your Regions at a Glance
          </h2>
        </div>
        <Button variant="ghost" size="sm" className="text-primary text-xs" onClick={() => navigate('/account?tab=regions')}>
          View all <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {enriched.map(region => (
          <Card
            key={region.id}
            className="surgical-glass border-white/[0.06] hover:border-primary/30 transition-all cursor-pointer group"
            onClick={() => navigate(`/map?region=${region.region_code}&type=${region.region_type}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-display text-sm font-semibold text-foreground">
                  {region.region_name || region.region_code}
                </span>
                <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground capitalize">
                  {region.region_type}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3 h-3 text-blue-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">{formatCompact(region.voters)}</p>
                    <p className="text-[10px] text-muted-foreground">Voters</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Vote className="w-3 h-3 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      {region.regRate != null ? region.regRate.toFixed(0) + '%' : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Reg.</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3 text-violet-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      {region.turnout != null ? region.turnout.toFixed(0) + '%' : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Turnout</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
