// src/components/AuthButtons.tsx
import { supabase } from "../lib/supabaseClient";

// Google OAuth Sign In
export function SignInWithGoogleButton() {
  const signIn = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) console.error("OAuth error", error);
    if (data?.url) window.location.href = data.url;
  };

  return (
    <button className="btn btn-primary" onClick={signIn}>
      Continue with Google
    </button>
  );
}

// Sign Out (clears session and returns to intro)
export function SignOutButton() {
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign out error", error);
    }
    // Ensure UI resets to pre-auth state
    window.location.replace("/");
  };

  return (
    <button className="btn" onClick={signOut}>
      Sign out
    </button>
  );
}
