import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { API } from "./api";
import type { UserRole } from "./roles";
import { normalizeRole } from "./roles";

export type SessionUser = {
  id: number;
  username: string;
  role: UserRole;
};

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  isObserve: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  clear: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API}/me`, { credentials: "include" });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = (await res.json()) as {
        id: number;
        username: string;
        role?: string;
      };
      setUser({
        id: Number(data.id),
        username: data.username,
        role: normalizeRole(data.role),
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isObserve: user?.role === "observe",
      isAdmin: user?.role === "admin",
      refresh,
      clear: () => setUser(null),
    }),
    [user, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
