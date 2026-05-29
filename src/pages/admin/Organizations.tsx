import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Building2, Search, Plus, Users, ChevronRight } from 'lucide-react';
import { useAdminOrganizations, useCreateOrganization } from '@/queries/useAdminOrgQueries';

export default function Organizations() {
  const navigate = useNavigate();
  const { data: orgs, isLoading } = useAdminOrganizations();
  const createOrg = useCreateOrganization();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [seatLimit, setSeatLimit] = useState('5');

  const filtered = useMemo(() => {
    if (!orgs) return [];
    const q = search.toLowerCase();
    return orgs.filter((o) => !q || o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
  }, [orgs, search]);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Organization name is required'); return; }
    try {
      const created = await createOrg.mutateAsync({ name, seatLimit: Number(seatLimit) || 5 });
      toast.success('Organization created');
      setDialogOpen(false);
      setName('');
      setSeatLimit('5');
      if (created?.id) navigate(`/admin/orgs/${created.id}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create organization');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground tracking-tight">Organizations</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage client organizations, members, and seats.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> New Organization</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>Add a new client organization. A URL slug is generated from the name.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="org-name">Name</Label>
                <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme for Congress" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-seats">Seat limit</Label>
                <Input id="org-seats" type="number" min={1} value={seatLimit} onChange={(e) => setSeatLimit(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createOrg.isPending}>
                {createOrg.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search organizations…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10" />
            </div>
            <span className="text-xs text-muted-foreground ml-auto">{filtered.length} org{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading organizations…</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No organizations found.</p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-border -mx-6">
                {filtered.map((o) => (
                  <button key={o.id} onClick={() => navigate(`/admin/orgs/${o.id}`)} className="w-full text-left px-6 py-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{o.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{o.slug}</p>
                    </div>
                    <Badge variant="secondary" className="gap-1"><Users className="w-3 h-3" />{o.member_count}/{o.seat_limit}</Badge>
                  </button>
                ))}
              </div>

              {/* Desktop table */}
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o) => {
                    const full = o.member_count >= o.seat_limit;
                    return (
                      <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/orgs/${o.id}`)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <span className="font-medium block">{o.name}</span>
                              <span className="text-xs text-muted-foreground">{o.slug}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={full ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-primary/15 text-primary border-primary/30'}>
                            <Users className="w-3 h-3 mr-1" />{o.member_count}/{o.seat_limit}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{format(new Date(o.created_at), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="text-right">
                          <ChevronRight className="w-4 h-4 text-muted-foreground inline" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
