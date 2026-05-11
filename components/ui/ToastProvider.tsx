"use client";

import { useState, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { ToastContext } from "@/hooks/useToast";
import type { ToastOptions, ConfirmOptions } from "@/hooks/useToast";
import Toast from "./Toast";
import ConfirmDialog from "./ConfirmDialog";

interface ToastItem {
  id: string;
  message: string;
  type: NonNullable<ToastOptions["type"]>;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const toastIdRef = useRef(0);

  const toast = useCallback((options: ToastOptions) => {
    const id = `toast-${++toastIdRef.current}`;
    const type = options.type || "info";
    setToasts((prev) => [...prev, { id, message: options.message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    confirmState?.resolve(true);
    setConfirmState(null);
  }, [confirmState]);

  const handleCancel = useCallback(() => {
    confirmState?.resolve(false);
    setConfirmState(null);
  }, [confirmState]);

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast Container */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto">
              <Toast id={t.id} message={t.message} type={t.type} onClose={removeToast} />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message || ""}
        confirmText={confirmState?.confirmText}
        cancelText={confirmState?.cancelText}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ToastContext.Provider>
  );
}
