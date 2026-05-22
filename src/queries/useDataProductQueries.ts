import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/contexts/OrgContext';
import { logActivity } from '@/lib/logActivity';
import { trackAddToCart } from '@/lib/metaPixel';

export function useDataProducts() {
  return useQuery({
    queryKey: ['data-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_products')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useCartItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['cart-items', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_cart_items')
        .select('*, data_products(*)')
        .eq('user_id', user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
}

export function useAddToCart() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeOrg } = useOrg();
  return useMutation({
    mutationFn: async (item: {
      product_id: string;
      geo_type: string;
      geo_code: string;
      geo_name: string;
      record_count: number;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('data_cart_items')
        .upsert(
          { ...item, user_id: user.id, organization_id: activeOrg?.id ?? null },
          { onConflict: 'user_id,product_id,geo_type,geo_code' }
        );
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['cart-items'] });
      logActivity('add_to_cart', { product_id: variables.product_id, geo_code: variables.geo_code, geo_type: variables.geo_type });
      trackAddToCart({
        productId: variables.product_id,
        productName: variables.product_id,
        geoName: variables.geo_name,
      });
    },
  });
}

export function useRemoveFromCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('data_cart_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart-items'] }),
  });
}

export function useClearCart() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('data_cart_items').delete().eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart-items'] }),
  });
}

export function useDataOrders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['data-orders', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
}

export function useDataOrderItems(orderId?: string) {
  return useQuery({
    queryKey: ['data-order-items', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_order_items')
        .select('*, data_products(*)')
        .eq('order_id', orderId!);
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
  });
}
