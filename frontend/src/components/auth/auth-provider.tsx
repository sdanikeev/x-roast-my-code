"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { refreshSession, type SessionUser } from "@/lib/api";
import * as authApi from "@/lib/auth";

type Status = "loading" | "authed" | "anon";
type Ctx = {
  status: Status;
  user?: SessionUser;
  setUser: (u: SessionUser) => void;
  signOut: (everywhere?: boolean) => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser>();
  const [status, setStatus] = useState<Status>("loading");
  const signedInExplicitly = useRef(false); // a login that finishes before the initial refresh must not be overwritten

  useEffect(() => {
    let live = true;
    refreshSession().then((u) => {
      if (!live || signedInExplicitly.current) return;
      setUser(u);
      setStatus(u ? "authed" : "anon");
    });
    return () => {
      live = false;
    };
  }, []);

  const signIn = useCallback((u: SessionUser) => {
    signedInExplicitly.current = true;
    setUser(u);
    setStatus("authed");
  }, []);

  const signOut = useCallback(async (everywhere = false) => {
    await (everywhere ? authApi.logoutEverywhere() : authApi.logout());
    setUser(undefined);
    setStatus("anon");
    signedInExplicitly.current = false;
  }, []);

  const value = useMemo(() => ({ status, user, setUser: signIn, signOut }), [status, user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
