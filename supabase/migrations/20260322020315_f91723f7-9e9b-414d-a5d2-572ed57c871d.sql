-- Allow admins to read saved_regions for any user
CREATE POLICY "Admins can view all saved regions"
  ON public.saved_regions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read data_cart_items for any user
CREATE POLICY "Admins can view all cart items"
  ON public.data_cart_items
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));