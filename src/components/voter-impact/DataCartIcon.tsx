import React from 'react';
import { ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCartItems, useRemoveFromCart } from '@/queries/useDataProductQueries';
import { formatNumber } from '@/lib/geoUtils';

interface DataCartIconProps {
  count: number;
  onClick: () => void;
}

export function DataCartIcon({ count, onClick }: DataCartIconProps) {
  const { data: cartItems } = useCartItems();
  const removeItem = useRemoveFromCart();

  const grouped = React.useMemo(() => {
    if (!cartItems?.length) return [];
    const map = new Map<string, { label: string; items: typeof cartItems }>();
    for (const item of cartItems) {
      const key = `${item.geo_type}:${item.geo_code}`;
      if (!map.has(key)) {
        map.set(key, { label: item.geo_name || item.geo_code, items: [] });
      }
      map.get(key)!.items.push(item);
    }
    return Array.from(map.entries()).map(([key, val]) => ({ key, ...val }));
  }, [cartItems]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Open cart">
          <ShoppingCart className="w-5 h-5" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold">Your Cart</h3>
          <p className="text-xs text-muted-foreground">{count} {count === 1 ? 'item' : 'items'}</p>
        </div>

        {grouped.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Your cart is empty. Add data products from the region sidebar.
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto divide-y divide-border">
            {grouped.map(group => (
              <div key={group.key} className="p-3">
                <p className="text-xs font-semibold text-foreground mb-1.5">{group.label}</p>
                <div className="space-y-1.5">
                  {group.items.map(item => {
                    const product = (item as any).data_products;
                    const records = item.record_count ?? 0;
                    return (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate flex-1">{product?.name ?? 'Product'}</span>
                        <span className="tabular-nums text-muted-foreground mx-2">{formatNumber(records)} records</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeItem.mutate(item.id); }}
                          className="text-muted-foreground/50 hover:text-destructive transition-colors"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-border p-3">
          <Button size="sm" className="w-full text-xs" onClick={onClick}>
            {count > 0 ? 'Request a Quote' : 'Browse Products'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
