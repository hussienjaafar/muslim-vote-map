import React, { useState, useMemo } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useDataProducts, useAddToCart } from '@/queries/useDataProductQueries';
import { formatNumber } from '@/lib/geoUtils';
import { Users, Megaphone, Crown, Award, Medal, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DataProductSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regionType: 'state' | 'district';
  regionCode: string;
  regionName: string;
  regionData: {
    muslimVoters: number;
    cellPhones: number;
    households: number;
    politicalActivists: number;
    politicalDonors: number;
    donorPlatinumCount: number;
    donorGoldCount: number;
    donorSilverCount: number;
  };
}

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  muslim_voters: <Users className="w-4 h-4" />,
  political_activists: <Megaphone className="w-4 h-4" />,
  donor_platinum: <Crown className="w-4 h-4" />,
  donor_gold: <Award className="w-4 h-4" />,
  donor_silver: <Medal className="w-4 h-4" />,
};

function getRecordCount(sourceField: string | null, regionData: DataProductSelectorProps['regionData']): number {
  switch (sourceField) {
    case 'muslim_voters': return regionData.muslimVoters ?? 0;
    case 'political_activists': return regionData.politicalActivists ?? 0;
    case 'donor_platinum': return regionData.donorPlatinumCount ?? 0;
    case 'donor_gold': return regionData.donorGoldCount ?? 0;
    case 'donor_silver': return regionData.donorSilverCount ?? 0;
    case 'households': return regionData.households ?? 0;
    case 'cell_phones': return regionData.cellPhones ?? 0;
    case 'political_donors': return regionData.politicalDonors ?? 0;
    default: return 0;
  }
}

export function DataProductSelector({
  open,
  onOpenChange,
  regionType,
  regionCode,
  regionName,
  regionData,
}: DataProductSelectorProps) {
  const { data: products } = useDataProducts();
  const addToCart = useAddToCart();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleProduct = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const subtotal = useMemo(() => {
    if (!products) return 0;
    return products
      .filter(p => selected.has(p.id))
      .reduce((sum, p) => {
        const records = getRecordCount(p.source_field, regionData);
        return sum + records * (p.price_per_record ?? 0);
      }, 0);
  }, [products, selected, regionData]);

  const handleAddToCart = async () => {
    if (!products) return;
    const selectedProducts = products.filter(p => selected.has(p.id));
    try {
      for (const p of selectedProducts) {
        const records = getRecordCount(p.source_field, regionData);
        if (records <= 0) continue;
        await addToCart.mutateAsync({
          product_id: p.id,
          geo_type: regionType,
          geo_code: regionCode,
          geo_name: regionName,
          record_count: records,
        });
      }
      toast.success(`Added ${selectedProducts.length} products to cart`);
      setSelected(new Set());
      onOpenChange(false);
    } catch (e) {
      toast.error('Failed to add to cart. Please sign in first.');
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display">Get Data for {regionName}</DrawerTitle>
          <DrawerDescription>Select data products for this {regionType}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4 max-h-[50vh] overflow-y-auto space-y-2">
          {products?.filter(product => getRecordCount(product.source_field, regionData) > 0).map(product => {
            const records = getRecordCount(product.source_field, regionData);
            const lineTotal = records * (product.price_per_record ?? 0);
            const disabled = false;
            const icon = PRODUCT_ICONS[product.source_field ?? ''] || <Users className="w-4 h-4" />;

            return (
              <label
                key={product.id}
                className={`flex items-center gap-3 p-3 rounded-lg border border-border transition-colors ${
                  disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-secondary/50'
                } ${selected.has(product.id) ? 'bg-secondary/50 border-primary/30' : ''}`}
              >
                <Checkbox
                  checked={selected.has(product.id)}
                  onCheckedChange={() => !disabled && toggleProduct(product.id)}
                  disabled={disabled}
                />
                <div className="text-muted-foreground">{icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{product.name}</div>
                  <div className="text-xs text-muted-foreground">{product.description}</div>
                  {product.data_fields && product.data_fields.length > 0 && (
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                      Fields: {product.data_fields.join(', ')}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted-foreground">{formatNumber(records)} records</div>
                </div>
              </label>
            );
          })}
        </div>
        <DrawerFooter>
           <div className="flex items-center justify-between w-full">
             <div className="text-sm text-muted-foreground">
               {selected.size} product{selected.size !== 1 ? 's' : ''} selected
             </div>
            <div className="flex gap-2">
              <DrawerClose asChild>
                <Button variant="outline">Cancel</Button>
              </DrawerClose>
              <Button
                onClick={handleAddToCart}
                disabled={selected.size === 0 || addToCart.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {addToCart.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Add to Cart
              </Button>
            </div>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
