"use client";

import { useState, useEffect, useCallback } from 'react';

export interface UserSession {
  id: string;
  phone?: string;
  username?: string;
  full_name?: string;
  role?: string;
  is_first_login?: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async (): Promise<UserSession | null> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        setUser(null);
        return null;
      }
      const data = await res.json();
      const userData = data.user || null;
      setUser(userData);
      return userData;
    } catch {
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    setUser(null);
    window.location.href = '/';
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { user, isLoading, refresh, logout };
}

/**
 * 服务端验证：调用 /api/auth/me 获取当前用户信息
 * 用于非 React 上下文或一次性获取场景
 */
export async function fetchCurrentUser(): Promise<UserSession | null> {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}
