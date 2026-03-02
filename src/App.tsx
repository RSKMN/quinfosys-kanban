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

function ProfileSetupModal({
  open,
  fullName,
  setFullName,
  selectedColor,
  setSelectedColor,
  colors,
  saving,
  error,
  onSave,
}: {
  open: boolean;
  fullName: string;
  setFullName: (value: string) => void;
  selectedColor: string;
  setSelectedColor: (value: string) => void;
  colors: string[];
  saving: boolean;
  error: string | null;
  onSave: () => Promise<void>;
}) {
  if (!open) return null;
  return (
    <div className="modal">
      <div className="modal-card">
        <h3 className="modal-title">Complete Your Profile</h3>
        <div className="muted">New collaborator detected. Please add your details to continue.</div>

        <label className="label">Full Name</label>
        <input
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Enter your full name"
        />

        <label className="label">Choose Your Color</label>
        <div className="palette" style={{ marginTop: 6 }}>
          {colors.map((c) => (
            <button
              key={c}
              className={`swatch${selectedColor === c ? " selected" : ""}`}
              style={{ background: c }}
              onClick={() => setSelectedColor(c)}
              aria-label={`Pick ${c}`}
            />
          ))}
        </div>

        {error ? <div className="muted" style={{ marginTop: 10, color: "#ef476f" }}>{error}</div> : null}

        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userColor, setUserColor] = useState(DEFAULT_USER_COLOR);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [fullName, setFullName] = useState("");
  const [pendingColor, setPendingColor] = useState(PALETTE[0]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
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
          .select("full_name, color")
          .eq("id", u.id)
          .maybeSingle();
        const hasProfile = Boolean(prof?.full_name && prof?.color);
        if (hasProfile) {
          if (prof?.color) setUserColor(prof.color);
          setNeedsProfileSetup(false);
        } else {
          setFullName(((u.user_metadata as any)?.full_name as string) || "");
          setPendingColor(PALETTE[0]);
          setNeedsProfileSetup(true);
        }

        if (window.location.pathname === "/callback") {
          window.history.replaceState({}, "", "/");
        }
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
    await supabase
      .from("profiles")
      .update({ color })
      .eq("id", uid)
      .select();
    await supabase
      .from("tasks")
      .update({ sticky_color: color })
      .eq("assigned_to", uid)
      .neq("status", "todo")
      .select();
    window.dispatchEvent(new CustomEvent("tasks:refresh"));
  }

  async function saveProfile() {
    if (!uid) return;
    const cleanName = fullName.trim();
    if (!cleanName) {
      setProfileError("Please enter your full name.");
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      const { data: clash } = await supabase
        .from("profiles")
        .select("id")
        .eq("color", pendingColor)
        .neq("id", uid);
      if (clash && clash.length > 0) {
        setProfileError("This color is already in use. Please choose another one.");
        return;
      }

      const attemptLimit = 6;
      let lastError: { message?: string; code?: string } | null = null;

      for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
        const { data: authData } = await supabase.auth.getUser();
        const freshUser = authData.user;
        const idToUse = freshUser?.id || uid;
        const emailToUse = freshUser?.email ?? email ?? null;

        const { error } = await supabase
          .from("profiles")
          .upsert(
            {
              id: idToUse,
              email: emailToUse,
              full_name: cleanName,
              color: pendingColor,
            },
            { onConflict: "id" }
          )
          .select();

        if (!error) {
          lastError = null;
          break;
        }

        lastError = { message: error.message, code: (error as any).code };
        const isProfileForeignKeyIssue =
          error.message?.includes("profiles_id_fkey") ||
          (error as any).code === "23503";

        if (!isProfileForeignKeyIssue || attempt === attemptLimit) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }

      if (lastError) {
        setProfileError(
          lastError.message ||
            "Failed to save profile. Please wait a moment and try again."
        );
        return;
      }

      setUserColor(pendingColor);
      setNeedsProfileSetup(false);
      window.dispatchEvent(new CustomEvent("tasks:refresh"));
    } finally {
      setProfileSaving(false);
    }
  }

  if (!ready) return <div className="page-pad">Loading…</div>;
  if (!email) return <Intro />;

  return (
    <div className="page-pad">
      <ProfileSetupModal
        open={needsProfileSetup}
        fullName={fullName}
        setFullName={setFullName}
        selectedColor={pendingColor}
        setSelectedColor={setPendingColor}
        colors={PALETTE}
        saving={profileSaving}
        error={profileError}
        onSave={saveProfile}
      />

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

      {!needsProfileSetup ? (
        <KanbanBoard stickyColor={userColor} currentUserId={uid!} />
      ) : null}
    </div>
  );
}

