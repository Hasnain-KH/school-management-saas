import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, get, post } from "../api/client.js";
import { notify } from "../components/feedback/appFeedback.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const wasAuthenticated = useRef(false);
  const expiryNotified = useRef(false);

  useEffect(() => {
    if (user) {
      wasAuthenticated.current = true;
      expiryNotified.current = false;
    }
  }, [user]);

  const loadIdentity = useCallback(async () => {
    const identity = await api("/auth/me");
    setUser(identity.user);
    setSchool(identity.school);
    return identity;
  }, []);

  useEffect(() => {
    const expire = () => {
      const notifyExpiry = wasAuthenticated.current;
      setUser(null);
      setSchool(null);
      setLoading(false);
      wasAuthenticated.current = false;
      if (notifyExpiry && !expiryNotified.current) {
        expiryNotified.current = true;
        notify.warning("Your session has expired", { description: "Sign in again to continue." });
      }
    };
    window.addEventListener("schoolflow:session-expired", expire);
    return () => window.removeEventListener("schoolflow:session-expired", expire);
  }, []);

  useEffect(() => {
    let active = true;
    get("/auth/csrf").then(() => loadIdentity()).catch(() => {
      if (!active) return;
      setUser(null);
      setSchool(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadIdentity]);

  const signIn = useCallback(async (credentials) => {
    await post("/auth/login", credentials);
    await loadIdentity();
  }, [loadIdentity]);

  const register = useCallback(async (details) => {
    const result = await post("/auth/register", details);
    if (result.authenticated) await loadIdentity();
    return result;
  }, [loadIdentity]);

  const signOut = useCallback(async () => {
    try {
      await post("/auth/logout", {});
    } finally {
      setUser(null);
      setSchool(null);
    }
  }, []);

  const value = useMemo(() => ({
    user, school, loading, signIn, register, signOut,
    refreshIdentity: loadIdentity
  }), [user, school, loading, signIn, register, signOut, loadIdentity]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
