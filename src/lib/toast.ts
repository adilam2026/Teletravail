"use client";

export type ToastVariant = "success" | "error" | "info";

export interface ToastPayload {
  id: string;
  message: string;
  variant: ToastVariant;
}

const EVENT_NAME = "app:toast";

/** Affiche un toast applicatif — jamais de `alert()` natif du navigateur. */
export function toast(message: string, variant: ToastVariant = "info"): void {
  if (typeof window === "undefined") return;
  const payload: ToastPayload = { id: crypto.randomUUID(), message, variant };
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT_NAME, { detail: payload }));
}

export function onToast(handler: (payload: ToastPayload) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ToastPayload>).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
