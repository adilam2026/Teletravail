"use client";

import { useEffect, useState } from "react";
import { onToast, type ToastPayload } from "@/lib/toast";

const VARIANT_STYLES: Record<ToastPayload["variant"], string> = {
  success: "bg-emerald-600 text-white",
  error: "bg-rose-600 text-white",
  info: "bg-slate-800 text-white",
};

const VARIANT_ICON: Record<ToastPayload["variant"], string> = {
  success: "✓",
  error: "⚠",
  info: "ℹ",
};

/** Hôte global des toasts applicatifs — monté une fois dans le layout racine. */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);

  useEffect(() => {
    return onToast((payload) => {
      setToasts((prev) => [...prev, payload]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== payload.id));
      }, 4000);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-elevated ${VARIANT_STYLES[t.variant]}`}
        >
          <span aria-hidden>{VARIANT_ICON[t.variant]}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
