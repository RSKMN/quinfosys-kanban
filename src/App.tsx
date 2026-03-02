// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { SignInWithGoogleButton, SignOutButton } from "./components/AuthButtons";
import KanbanBoard from "./components/KanbanBoard";

function Intro() {
  return (
    <div className="intro-hero">
      <div className="intro-card">
        <h1 className="intro-title">Welcome, Collaborator</h1>
        <p className="intro-sub">
          Thank you for teaming up with <span className="brand">Quinfosys</span>
        </p>
        <p className="intro-desc">
          Plan, prioritize, and deliver with a delightful Kanban experience for the Drug Discovery Project.
        </p>
        <div className="intro-actions">
          <SignInWithGoogleButton />
        </div>
      </div>
    </div>
  );
}

const DEFAULT_USER_COLOR = "#06D6A0"; // not shown in the palette
const PALETTE = ["#FF6B6B", "#FFD166", "#4CC9F0", "#F72585", "#F4A261", "#43AA8B", "#F77F00"]; // curated

export default function App() {
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userColor, setUserColor] = useState(DEFAULT_USER_COLOR);
  const [theme, setTheme] = useState<"dark" | "light">(
    (localStorage.getItem("theme") as "dark" | "light") || "dark"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user ?? null;
      setUid(u?.id ?? null);
      setEmail(u?.email ?? null);
      if (u?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("color")
          .eq("id", u.id)
          .maybeSingle();
        if (prof?.color) setUserColor(prof.color);
      }
      setReady(true);
    })();
  }, []);

  const paletteToShow = useMemo(
    () => PALETTE.filter((c) => c.toLowerCase() !== DEFAULT_USER_COLOR.toLowerCase()),
    []
  );

  async function chooseColor(color: string) {
    if (!uid) return;
    // Ensure uniqueness: check if another profile already uses this color
    const { data: clash } = await supabase
      .from("profiles")
      .select("id")
      .eq("color", color)
      .neq("id", uid);
    if (clash && clash.length > 0) {
      alert("Color already taken by another collaborator. Please pick a different one.");
      return;
    }
    setUserColor(color);
    await supabase.from("profiles").update({ color }).eq("id", uid);
    await supabase
      .from("tasks")
      .update({ sticky_color: color })
      .eq("assigned_to", uid)
      .neq("status", "todo");
    window.dispatchEvent(new CustomEvent("tasks:refresh"));
  }

  if (!ready) return <div className="page-pad">Loading…</div>;
  if (!email) return <Intro />;

  return (
    <div className="page-pad">
      <header className="topbar">
        <div className="left">
          <span className="chip">Company</span>
          <div className="brand-wrap">
            <div className="brand">Quinfosys</div>
            <div className="brand-sub">Drug Discovery Project</div>
          </div>
        </div>

        <div className="toolbar">
          <div className="palette" title="Choose a unique color">
            {paletteToShow.map((c) => (
              <button
                key={c}
                className={`swatch${userColor === c ? " selected" : ""}`}
                style={{ background: c }}
                onClick={() => chooseColor(c)}
                aria-label={`Pick ${c}`}
              />
            ))}
          </div>

          <label className="switch" title="Toggle theme">
            <input
              type="checkbox"
              checked={theme === "light"}
              onChange={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            />
            <span className="slider" />
            <span className="icon sun">☀️</span>
            <span className="icon moon">🌙</span>
          </label>

          <span className="muted">Signed in as {email}</span>
          <SignOutButton />
        </div>
      </header>

      <KanbanBoard stickyColor={userColor} currentUserId={uid!} />
    </div>
  );
}

