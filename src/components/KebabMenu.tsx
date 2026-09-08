"use client";

import { useEffect, useRef, useState } from "react";

export interface KebabMenuItem {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}

/**
 * Menu "⋯" partagé pour les actions secondaires d'une ligne de décision
 * (jamais plus d'un bouton principal visible, le reste reste accessible
 * sans jamais accumuler de boutons) — utilisé aussi bien par le planning
 * télétravail que par le workflow congés/absences.
 */
export function KebabMenu({ items }: { items: KebabMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-400 hover:bg-slate-100"
        aria-label="Plus d'actions"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-52 rounded-lg border border-slate-100 bg-white py-1 shadow-elevated">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-xs font-medium hover:bg-slate-50 ${
                item.tone === "danger" ? "text-rose-600" : "text-slate-700"
              }`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
