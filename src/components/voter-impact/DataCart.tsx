import React, { useState } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCartItems, useRemoveFromCart, useClearCart } from '@/queries/useDataProductQueries';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { formatNumber } from '@/lib/geoUtils';
import { logActivity } from '@/lib/logActivity';
import { Trash2, X, Send, Loader2, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { trackInitiateCheckout } from '@/lib/metaPixel';

interface DataCartProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DataCart({ open, onOpenChange }: DataCartProps) {
  const { data: items } = useCartItems();
  const removeItem = useRemoveFromCart();
  const clearCart = useClearCart();
  const { user } = useAuth();
  const { activeOrg } = useOrg();
  const [submitting, setSubmitting] = useState(false);

  const grouped = React.useMemo(() => {
    if (!items) return {};
    const g: Record<string, typeof items> = {};
    items.forEach(item => {
      const key = `${item.geo_type}:${item.geo_code}`;
      if (!g[key]) g[key] = [];
      g[key].push(item);
    });
    return g;
  }, [items]);

  const handleRequestQuote = async () => {
    if (!user || !items || items.length === 0) return;
    setSubmitting(true);
    try {
      const orderId = crypto.randomUUID();
      const { error: orderError } = await supabase.from('data_orders').insert({
        id: orderId,
        user_id: user.id,
        organization_id: activeOrg?.id ?? null,
        status: 'pending',
        delivery_email: user.email,
      });
      if (orderError) throw orderError;

      const orderItems = items.map(item => ({
        order_id: orderId,
        product_id: item.product_id,
        geo_type: item.geo_type,
        geo_code: item.geo_code,
        geo_name: item.geo_name,
        record_count: item.record_count ?? 1,
        issue_id: (item as any).issue_id ?? null,
        issue_name: (item as any).issue_name ?? null,
      }));
      const { error: itemsError } = await supabase.from('data_order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      await supabase.from('data_cart_items').delete().eq('user_id', user.id);

      logActivity('submit_order', { order_id: orderId, item_count: items.length });

      // Meta Pixel: InitiateCheckout event
      trackInitiateCheckout({
        itemCount: items.length,
        orderId,
        email: user.email,
        firstName: user.user_metadata?.full_name?.split(' ')[0],
      });

      supabase.functions.invoke('notify-admins', {
        body: {
          type: 'new_order',
          data: {
            userEmail: user.email,
            userName: user.user_metadata?.full_name || user.email,
            orderId,
            itemCount: items.length,
          },
        },
      });

      toast.success('Quote request submitted! Our team will contact you within 24 hours.');
      onOpenChange(false);
    } catch (err: any) {
      console.error('Quote request error:', err);
      toast.error('Failed to submit quote request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const itemCount = items?.length ?? 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display text-lg">Data Cart</DrawerTitle>
          <DrawerDescription>
            {itemCount} {itemCount === 1 ? 'product' : 'products'} across {Object.keys(grouped).length} {Object.keys(grouped).length === 1 ? 'region' : 'regions'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-4 max-h-[50vh] overflow-y-auto space-y-3">
          {Object.entries(grouped).map(([key, groupItems]) => {
            const geoType = groupItems[0]?.geo_type;
            return (
              <div key={key} className="bg-secondary/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {groupItems[0]?.geo_name || key}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">
                    {geoType}
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  {groupItems.map(item => {
                    const product = (item as any).data_products;
                    const records = item.record_count ?? 1;
                    return (
                      <div key={item.id} className="bg-background/50 rounded-md px-3 py-2 flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-foreground">
                            {product?.name || 'Product'}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {formatNumber(records)} records
                          </span>
                          {(item as any).issue_name && (
                            <span className="block text-[11px] text-primary mt-0.5">
                              Issue: {(item as any).issue_name}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => removeItem.mutate(item.id)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {itemCount === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ShoppingBag className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Your cart is empty</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Select a region on the map and add data products from the sidebar.
              </p>
            </div>
          )}
        </div>

        <DrawerFooter className="border-t border-border pt-4">
          {itemCount > 0 && (
            <div className="flex items-center justify-between w-full gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearCart.mutate()}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Clear All
              </Button>
              <Button
                size="default"
                onClick={handleRequestQuote}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-1.5" />
                )}
                Request Quote
              </Button>
            </div>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
