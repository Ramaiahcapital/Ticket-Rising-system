import { z } from "zod";
import { createRouter, adminQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";

export const transferUserRouter = createRouter({
  list: adminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const db = supabase as any;
    const { data, error } = await db
      .from("transfer_users")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }),

  create: adminQuery
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        department: z.string().optional(),
        credential: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const db = supabase as any;
      const { data, error } = await db
        .from("transfer_users")
        .insert({
          name: input.name.trim(),
          email: input.email.toLowerCase().trim(),
          department: input.department?.trim() || null,
          credential: input.credential?.trim() || null,
          created_by: ctx.user.id,
        })
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }),

  update: adminQuery
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        department: z.string().optional(),
        credential: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const db = supabase as any;
      const updates: any = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) updates.name = input.name.trim();
      if (input.email !== undefined) updates.email = input.email.toLowerCase().trim();
      if (input.department !== undefined) updates.department = input.department?.trim() || null;
      if (input.credential !== undefined) updates.credential = input.credential?.trim() || null;

      const { error } = await db
        .from("transfer_users")
        .update(updates)
        .eq("id", input.id);
      if (error) throw new Error(error.message);
      return { success: true };
    }),

  delete: adminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const db = supabase as any;
      const { error } = await db.from("transfer_users").delete().eq("id", input.id);
      if (error) throw new Error(error.message);
      return { success: true };
    }),
});
