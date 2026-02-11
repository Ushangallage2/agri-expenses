import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Determine base URL for Netlify Functions
  const BASE = import.meta.env.DEV
    ? "http://localhost:8888/.netlify/functions"
    : "/.netlify/functions";

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // 🔑 cookie will be saved automatically
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const msg = await res.text();
        console.log("Login error:", msg);
        setError(msg || "Invalid credentials");
        setLoading(false);
        return;
      }

      // ✅ On success, cookie is already set (HttpOnly)
      navigate("/dashboard"); // redirect to protected page
    } catch (err) {
      console.error("Login request failed:", err);
      setError("Server error. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleLogin}
        className="glass-card w-full max-w-sm"
      >
        <h1 className="text-2xl text-center mb-6">🌾 Agri Expenses</h1>

        {error && (
          <p className="text-red-400 text-sm mb-3">{error}</p>
        )}

        <input
          className="glass-input mb-3"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <input
          className="glass-input mb-4"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="submit"
          className={`glass-btn w-full ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
