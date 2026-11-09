import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { play, unlockAudio } from "../utils/sounds";
import SoundToggle from "../components/SoundToggle";

export default function Signup() {
  const [farmName, setFarmName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    void unlockAudio();
    play("click");

    try {
      const res = await fetch(`${API}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ farmName, username, password }),
      });

      if (!res.ok) {
        const msg = await res.text();
        play("error");
        setError(msg || "Could not create account");
        setLoading(false);
        return;
      }

      await refresh();
      play("success");
      navigate("/dashboard");
    } catch {
      play("error");
      setError("Server error. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 gold-sheen pointer-events-none opacity-40" />
      <div className="absolute top-4 left-4 z-20">
        <Link
          to="/"
          className="text-sm text-gold-muted hover:text-gold tracking-wide"
        >
          ← Home
        </Link>
      </div>
      <div className="absolute top-4 right-4 z-20">
        <SoundToggle />
      </div>
      <form
        onSubmit={handleSignup}
        className="glass-card w-full max-w-md relative z-10 animate-rise"
      >
        <p className="eyebrow text-center">Start your farm</p>
        <h1 className="font-display text-4xl text-center text-gold glow-text mb-2">
          Create account
        </h1>
        <p className="text-center text-gold-muted text-sm mb-8">
          Your own private ledger — plus the shared crop knowledge base.
        </p>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <input
          className="glass-input mb-3"
          placeholder="Farm name (e.g. Green Valley Estate)"
          value={farmName}
          onChange={(e) => setFarmName(e.target.value)}
        />

        <input
          className="glass-input mb-3"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <input
          className="glass-input mb-6"
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          className={`glass-btn gold-btn w-full ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          disabled={loading}
        >
          {loading ? "Creating…" : "Create my farm"}
        </button>

        <p className="text-center text-gold-muted text-sm mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-gold hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
