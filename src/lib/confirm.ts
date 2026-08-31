"use client";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

export interface ConfirmRequest extends ConfirmOptions {
  id: string;
}

const REQUEST_EVENT = "app:confirm-request";
const RESOLVE_EVENT = "app:confirm-resolve";

/** Ouvre la modale de confirmation applicative et résout `true`/`false` — jamais de `confirm()` natif. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    const id = crypto.randomUUID();
    const onResolve = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; result: boolean }>).detail;
      if (detail.id !== id) return;
      window.removeEventListener(RESOLVE_EVENT, onResolve);
      resolve(detail.result);
    };
    window.addEventListener(RESOLVE_EVENT, onResolve);
    window.dispatchEvent(new CustomEvent<ConfirmRequest>(REQUEST_EVENT, { detail: { id, ...options } }));
  });
}

export function onConfirmRequest(handler: (request: ConfirmRequest) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ConfirmRequest>).detail);
  window.addEventListener(REQUEST_EVENT, listener);
  return () => window.removeEventListener(REQUEST_EVENT, listener);
}

export function resolveConfirm(id: string, result: boolean): void {
  window.dispatchEvent(new CustomEvent(RESOLVE_EVENT, { detail: { id, result } }));
}
