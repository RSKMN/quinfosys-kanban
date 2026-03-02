// src/auth/Callback.tsx
import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { ensureProfile } from "../lib/ensureProfile"; // add this

export default function Callback() {
  useEffect(() => {
    supabase.auth.getSession().then(async () => {
      await ensureProfile(); // create profile row if missing
      window.location.replace("/");
    });
  }, []);
  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-indigo-900 via-slate-900 to-black">
      <div className="glass-card p-6 border border-white/10 text-slate-200">Signing in...</div>
    </main>
  );
}
