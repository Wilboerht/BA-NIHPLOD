"use client";

import { createContext, useContext } from "react";
import type { UserSession } from "@/types";

const WorkbenchAuthContext = createContext<UserSession | null>(null);

export function WorkbenchAuthProvider({
  user,
  children,
}: {
  user: UserSession;
  children: React.ReactNode;
}) {
  return (
    <WorkbenchAuthContext.Provider value={user}>
      {children}
    </WorkbenchAuthContext.Provider>
  );
}

export function useWorkbenchUser(): UserSession {
  const user = useContext(WorkbenchAuthContext);
  if (!user) {
    throw new Error("useWorkbenchUser must be used within WorkbenchAuthProvider");
  }
  return user;
}
