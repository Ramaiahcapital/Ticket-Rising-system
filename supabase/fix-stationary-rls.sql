-- Fix RLS for stationary tables (Supabase security warning rls_disabled_in_public).
-- Run this once in Supabase SQL Editor.
-- The app accesses these tables only via the server (service_role key), which BYPASSES RLS,
-- so enabling RLS does NOT affect app functionality. Keeping no public/authenticated policies
-- guarantees no anon/user can read, write, or delete stationary data directly.

-- 1. Enable RLS on all 4 tables (idempotent)
ALTER TABLE public.stationary_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stationary_portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stationary_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stationary_order_items ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies (clean slate, including previously-created authenticated reads)
DROP POLICY IF EXISTS "Service role full access on stationary_items" ON public.stationary_items;
DROP POLICY IF EXISTS "Service role full access on stationary_portal_settings" ON public.stationary_portal_settings;
DROP POLICY IF EXISTS "Service role full access on stationary_orders" ON public.stationary_orders;
DROP POLICY IF EXISTS "Service role full access on stationary_order_items" ON public.stationary_order_items;
DROP POLICY IF EXISTS "Authenticated users can read stationary items" ON public.stationary_items;
DROP POLICY IF EXISTS "Authenticated users can read portal settings" ON public.stationary_portal_settings;
DROP POLICY IF EXISTS "Users can read own orders" ON public.stationary_orders;
DROP POLICY IF EXISTS "Users can read own order items" ON public.stationary_order_items;

-- 3. Service role full access (bypasses RLS anyway; explicit policy documents intent and satisfies the linter)
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