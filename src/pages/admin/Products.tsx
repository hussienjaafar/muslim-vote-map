import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'data_products'>;

function useProducts() {
  return useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('data_products').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const { data: products, isLoading } = useProducts();
  const [editing, setEditing] = useState<Product | null>(null);

  const updateProduct = useMutation({
    mutationFn: async (p: Partial<Product> & { id: string }) => {
      const { error } = await supabase.from('data_products').update(p).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-products'] }); setEditing(null); toast.success('Product updated'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-10 space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-foreground tracking-tight">Products</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">Data product catalog and pricing.</p>
      </div>

      {/* Table */}
      <div className="surgical-glass">
        {isLoading ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Loading products...</p>
          </div>
        ) : (
          <>
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-white/5">
            {products?.map(p => (
              <button
                key={p.id}
                onClick={() => setEditing(p)}
                className="w-full text-left p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-foreground">{p.name}</span>
                  {p.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shrink-0">Active</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-white/5 text-muted-foreground border-white/10 shrink-0">Inactive</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-muted-foreground capitalize">{p.product_type}</span>
                  <span className="tabular-nums text-foreground font-semibold">${Number(p.price_per_record ?? 0).toFixed(2)}/rec</span>
                </div>
                {p.source_field && (
                  <p className="font-mono text-[10px] text-muted-foreground mt-1 truncate">{p.source_field}</p>
                )}
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="border-b border-white/5 hover:bg-transparent">
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Name</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Type</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Price/Record</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Source Field</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Active</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.map(p => (
                <TableRow key={p.id} className="border-b border-white/5 hover:bg-[#1c1c1e] transition-colors">
                  <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{p.product_type}</TableCell>
                  <TableCell className="tabular-nums text-foreground">${Number(p.price_per_record ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.source_field || '—'}</TableCell>
                  <TableCell>
                    {p.is_active ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Active</span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-white/5 text-muted-foreground border-white/10">Inactive</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => setEditing(p)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-sm transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="bg-[#1c1c1e] border-[rgba(255,255,255,0.08)] rounded-md">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground">Edit Product</DialogTitle>
          </DialogHeader>
          {editing && (
            <ProductForm
              product={editing}
              onSave={p => updateProduct.mutate(p)}
              saving={updateProduct.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductForm({ product, onSave, saving }: { product: Product; onSave: (p: Partial<Product> & { id: string }) => void; saving: boolean }) {
  const [name, setName] = useState(product.name);
  const [desc, setDesc] = useState(product.description ?? '');
  const [price, setPrice] = useState(String(product.price_per_record ?? 0));
  const [source, setSource] = useState(product.source_field ?? '');
  const [active, setActive] = useState(product.is_active ?? true);

  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault();
        onSave({ id: product.id, name, description: desc, price_per_record: parseFloat(price) || 0, source_field: source || null, is_active: active });
      }}
    >
      <div>
        <Label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} className="mt-1 bg-[#2c2c2e] border-[rgba(255,255,255,0.08)] focus:ring-blue-500/20" />
      </div>
      <div>
        <Label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Description</Label>
        <Input value={desc} onChange={e => setDesc(e.target.value)} className="mt-1 bg-[#2c2c2e] border-[rgba(255,255,255,0.08)] focus:ring-blue-500/20" />
      </div>
      <div>
        <Label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Price per Record ($)</Label>
        <Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="mt-1 bg-[#2c2c2e] border-[rgba(255,255,255,0.08)] focus:ring-blue-500/20 tabular-nums" />
      </div>
      <div>
        <Label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Source Field</Label>
        <Input value={source} onChange={e => setSource(e.target.value)} className="mt-1 bg-[#2c2c2e] border-[rgba(255,255,255,0.08)] focus:ring-blue-500/20" />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={active} onCheckedChange={setActive} />
        <Label className="text-sm text-muted-foreground">Active</Label>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="w-full py-2.5 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-[0.15em] rounded-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </form>
  );
}
