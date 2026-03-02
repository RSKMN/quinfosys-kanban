// src/lib/ensureProfile.ts
import { supabase } from "./supabaseClient";

export async function ensureProfile() {
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return;
  const payload = {
    id: u.id,
    email: u.email ?? null,
    full_name: (u.user_metadata as any)?.full_name ?? null,
  };
  await supabase.from("profiles").upsert(payload, { onConflict: "id" }); // idempotent
}
