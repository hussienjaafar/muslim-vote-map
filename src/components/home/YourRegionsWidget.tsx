import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, MapPin, Users, Zap, Phone } from 'lucide-react';
import { useIssueDonorDistricts, useIssueDonorStates } from '@/hooks/useIssueDonorData';

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

export function YourRegionsWidget({ regions, issueId }: { regions: SavedRegion[]; issueId: string | null }) {
  const navigate = useNavigate();
  const issueIds = issueId ? [issueId] : [];
  const { data: issueStates } = useIssueDonorStates(issueIds);
  const { data: issueDistricts } = useIssueDonorDistricts(issueIds);

  const enriched = useMemo(() => {
    if (!regions.length) return [];
    return regions.map(region => {
      let totalDonors = 0;
      let goldDonors = 0;
      let cellPhones = 0;

      if (region.region_type === 'state' && issueStates) {
        const state = issueStates.find(s => s.state_code === region.region_code);
        if (state) {
          totalDonors = state.total_donors || 0;
          goldDonors = state.gold_donors || 0;
          cellPhones = (state.gold_cell_phones || 0) + (state.silver_cell_phones || 0);
        }
      } else if (region.region_type === 'district' && issueDistricts) {
        const district = issueDistricts.find(d => d.cd_code === region.region_code);
        if (district) {
          totalDonors = district.total_donors || 0;
          goldDonors = district.gold_donors || 0;
          cellPhones = (district.gold_cell_phones || 0) + (district.silver_cell_phones || 0);
        }
      }

      return { ...region, totalDonors, goldDonors, cellPhones };
    });
  }, [regions, issueStates, issueDistricts]);

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
            onClick={() => navigate(`/map?region=${region.region_code}&type=${region.region_type}&issue=${issueId ?? ''}`)}
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
                  <Users className="w-3 h-3 text-cyan-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">{formatCompact(region.totalDonors)}</p>
                    <p className="text-[10px] text-muted-foreground">Donors</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-yellow-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">{formatCompact(region.goldDonors)}</p>
                    <p className="text-[10px] text-muted-foreground">Gold</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-violet-400 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">{formatCompact(region.cellPhones)}</p>
                    <p className="text-[10px] text-muted-foreground">Phones</p>
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
