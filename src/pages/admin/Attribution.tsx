import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, RefreshCw, Target, Loader2, Sparkles } from 'lucide-react';
import { useAdminOrganizations } from '@/queries/useAdminOrgQueries';
import {
  useRefcodeMappings, useUpsertMapping, useDeleteMapping,
  useFormOverrides, useUpsertOverride, useDeleteOverride,
  useAttributionStatus, useRecomputeAttribution, useSyncMetaAdLinks,
  ATTRIBUTION_CHANNELS, MATCH_TYPES,
  type RefcodeMapping, type FormOverride,
} from '@/queries/useAttributionQueries';

const fmtCurrency = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function Attribution() {
  const { data: orgs, isLoading: orgsLoading } = useAdminOrganizations();
  const [orgId, setOrgId] = useState<string | null>(null);
  const effectiveOrg = orgId ?? orgs?.[0]?.id ?? null;

  const { data: mappings } = useRefcodeMappings(effectiveOrg);
  const { data: overrides } = useFormOverrides(effectiveOrg);
  const { data: status } = useAttributionStatus(effectiveOrg);
  const recompute = useRecomputeAttribution(effectiveOrg);
  const syncMeta = useSyncMetaAdLinks(effectiveOrg);

  const totalRaised = useMemo(() => (status ?? []).reduce((a, s) => a + s.raised, 0), [status]);

  const handleRecompute = async () => {
    try {
      await recompute.mutateAsync();
      toast.success('Attribution recomputed for this organization.');
    } catch (e: any) {
      toast.error(e.message ?? 'Recompute failed');
    }
  };

  const handleSyncMeta = async () => {
    try {
      await syncMeta.mutateAsync();
      toast.success('Synced Meta ad links and recomputed attribution.');
    } catch (e: any) {
      toast.error(e.message ?? 'Meta ad link sync failed');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground tracking-tight">Attribution</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Map refcodes &amp; forms to channels so donations attribute to Meta, SMS, Email, Organic, or Other.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={effectiveOrg ?? undefined} onValueChange={setOrgId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder={orgsLoading ? 'Loading…' : 'Select organization'} />
            </SelectTrigger>
            <SelectContent>
              {(orgs ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSyncMeta} disabled={!effectiveOrg || syncMeta.isPending} variant="outline" className="gap-2">
            {syncMeta.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Sync Meta ad links
          </Button>
          <Button onClick={handleRecompute} disabled={!effectiveOrg || recompute.isPending} className="gap-2">
            {recompute.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Recompute
          </Button>
        </div>
      </header>

      {/* Status summary */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-primary" />
            <h3 className="font-display font-bold text-foreground">Attribution coverage</h3>
          </div>
          {!status?.length ? (
            <p className="text-sm text-muted-foreground">No donations for this organization.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {status.map((s) => (
                <div key={`${s.method}-${s.channel}`} className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground capitalize">{s.channel} · {s.method}</p>
                  <p className="text-sm font-bold text-foreground tabular-nums mt-1">{fmtCurrency(s.raised)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.count.toLocaleString()} gifts · {totalRaised > 0 ? ((s.raised / totalRaised) * 100).toFixed(0) : 0}%
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <MappingsSection orgId={effectiveOrg} mappings={mappings ?? []} />
      <OverridesSection orgId={effectiveOrg} overrides={overrides ?? []} />
    </div>
  );
}

function ChannelBadge({ channel }: { channel: string | null }) {
  if (!channel) return <span className="text-muted-foreground">—</span>;
  return <Badge variant="outline" className="capitalize">{channel}</Badge>;
}

function MappingsSection({ orgId, mappings }: { orgId: string | null; mappings: RefcodeMapping[] }) {
  const upsert = useUpsertMapping(orgId);
  const del = useDeleteMapping(orgId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<RefcodeMapping>>({ match_type: 'exact', channel: 'meta', priority: 100 });

  const openNew = () => { setDraft({ match_type: 'exact', channel: 'meta', priority: 100 }); setOpen(true); };
  const openEdit = (m: RefcodeMapping) => { setDraft({ ...m }); setOpen(true); };

  const save = async () => {
    if (!draft.pattern?.trim()) { toast.error('Refcode / pattern is required'); return; }
    if (!draft.channel) { toast.error('Channel is required'); return; }
    try {
      await upsert.mutateAsync(draft);
      toast.success('Mapping saved');
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Save failed');
    }
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-foreground">Refcode mappings</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Exact, prefix, or contains match on the donation refcode. Lower priority wins.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2" onClick={openNew} disabled={!orgId}><Plus className="w-4 h-4" /> Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{draft.id ? 'Edit mapping' : 'New mapping'}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Refcode / pattern</Label>
                  <Input value={draft.pattern ?? ''} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} placeholder="q2fad or bernie-em" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Match type</Label>
                    <Select value={draft.match_type ?? 'exact'} onValueChange={(v) => setDraft({ ...draft, match_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MATCH_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={draft.channel ?? 'meta'} onValueChange={(v) => setDraft({ ...draft, channel: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ATTRIBUTION_CHANNELS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Campaign label (optional)</Label>
                    <Input value={draft.campaign_label ?? ''} onChange={(e) => setDraft({ ...draft, campaign_label: e.target.value })} placeholder="Q2 FB Acquisition" />
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Input type="number" value={draft.priority ?? 100} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} disabled={upsert.isPending}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {!mappings.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No mappings yet. Add patterns like <code>q2fad</code> → Meta.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pattern</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Priority</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id} className="cursor-pointer" onClick={() => openEdit(m)}>
                  <TableCell className="font-mono text-xs">{m.pattern ?? m.refcode}</TableCell>
                  <TableCell className="capitalize text-xs">{m.match_type}</TableCell>
                  <TableCell><ChannelBadge channel={m.channel} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.campaign_label ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.priority}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost" size="icon"
                      onClick={(e) => { e.stopPropagation(); del.mutate(m.id); }}
                      aria-label="Delete mapping"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function OverridesSection({ orgId, overrides }: { orgId: string | null; overrides: FormOverride[] }) {
  const upsert = useUpsertOverride(orgId);
  const del = useDeleteOverride(orgId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<FormOverride>>({ attributed_channel: 'sms' });

  const openNew = () => { setDraft({ attributed_channel: 'sms' }); setOpen(true); };
  const openEdit = (o: FormOverride) => { setDraft({ ...o }); setOpen(true); };

  const save = async () => {
    if (!draft.contribution_form?.trim()) { toast.error('Form name / slug is required'); return; }
    try {
      await upsert.mutateAsync(draft);
      toast.success('Override saved');
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Save failed');
    }
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-foreground">Form overrides</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Lock a dedicated contribution form to a channel (highest priority).</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2" onClick={openNew} disabled={!orgId}><Plus className="w-4 h-4" /> Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{draft.id ? 'Edit override' : 'New override'}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Form name / slug (substring match)</Label>
                  <Input value={draft.contribution_form ?? ''} onChange={(e) => setDraft({ ...draft, contribution_form: e.target.value })} placeholder="mpac-sms2" />
                </div>
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={draft.attributed_channel ?? 'sms'} onValueChange={(v) => setDraft({ ...draft, attributed_channel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ATTRIBUTION_CHANNELS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} disabled={upsert.isPending}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {!overrides.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No form overrides yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => openEdit(o)}>
                  <TableCell className="font-mono text-xs">{o.contribution_form}</TableCell>
                  <TableCell><ChannelBadge channel={o.attributed_channel} /></TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost" size="icon"
                      onClick={(e) => { e.stopPropagation(); del.mutate(o.id); }}
                      aria-label="Delete override"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
