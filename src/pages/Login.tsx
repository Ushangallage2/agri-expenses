import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { play, unlockAudio } from "../utils/sounds";
import SoundToggle from "../components/SoundToggle";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    void unlockAudio();
    play("click");

    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const msg = await res.text();
        play("error");
        setError(msg || "Invalid credentials");
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
        onSubmit={handleLogin}
        className="glass-card w-full max-w-md relative z-10 animate-rise"
      >
        <p className="eyebrow text-center">Private ledger</p>
        <h1 className="font-display text-4xl text-center text-gold glow-text mb-2">
          Agri Ledger
        </h1>
        <p className="text-center text-gold-muted text-sm mb-8">
          Income, expenses, and profit — kept clear.
        </p>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

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
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          className={`glass-btn gold-btn w-full ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          disabled={loading}
        >
          {loading ? "Signing in…" : "Enter ledger"}
        </button>
      </form>
    </div>
  );
}
