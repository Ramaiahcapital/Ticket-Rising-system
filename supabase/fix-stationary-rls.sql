-- Fix RLS for stationary tables (Supabase security warning)
-- Enable RLS and add service-role-only policies

-- 1. Enable RLS on all 4 tables
ALTER TABLE public.stationary_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stationary_portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stationary_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stationary_order_items ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies (clean slate)
DROP POLICY IF EXISTS "Service role full access on stationary_items" ON public.stationary_items;
DROP POLICY IF EXISTS "Service role full access on stationary_portal_settings" ON public.stationary_portal_settings;
DROP POLICY IF EXISTS "Service role full access on stationary_orders" ON public.stationary_orders;
DROP POLICY IF EXISTS "Service role full access on stationary_order_items" ON public.stationary_order_items;

-- 3. Service role has full access (bypasses RLS anyway, but this satisfies the linter)
CREATE POLICY "Service role full access on stationary_items"
  ON public.stationary_items FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on stationary_portal_settings"
  ON public.stationary_portal_settings FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on stationary_orders"
  ON public.stationary_orders FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on stationary_order_items"
  ON public.stationary_order_items FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Allow authenticated users to read stationary_items and portal settings
--    (for the branch portal UI)
CREATE POLICY "Authenticated users can read stationary items"
  ON public.stationary_items FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read portal settings"
  ON public.stationary_portal_settings FOR SELECT
  USING (auth.role() = 'authenticated');

-- 5. Branch users can read their own orders; admins can read all
CREATE POLICY "Users can read own orders"
  ON public.stationary_orders FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR "branchId" = auth.uid()
  );

CREATE POLICY "Users can read own order items"
  ON public.stationary_order_items FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.stationary_orders
      WHERE stationary_orders.id = stationary_order_items."orderId"
        AND stationary_orders."branchId" = auth.uid()
    )
  );
