"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/actions/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  /** Regroupe visuellement les items sous un intitulé (ex. "Mon équipe" / "Moi") — évite de mélanger vues personnelles et vues d'équipe dans une liste plate. */
  section?: string;
}

export function NavSidebar({
  items,
  userName,
  roleLabel,
}: {
  items: NavItem[];
  userName: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="text-lg">🏠</span> Télétravail
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600"
        >
          Menu
        </button>
      </header>

      <aside
        className={`${open ? "block" : "hidden"} border-b border-slate-100 bg-white lg:sticky lg:top-0 lg:block lg:h-screen lg:w-64 lg:border-b-0 lg:border-r`}
      >
        <div className="hidden items-center gap-2 px-6 py-6 text-lg font-semibold text-slate-900 lg:flex">
          <span className="text-xl">🏠</span> Télétravail
        </div>

        <div className="px-4 pb-2 pt-4 lg:px-6 lg:pt-0">
          <p className="text-sm font-semibold text-slate-900">{userName}</p>
          <p className="text-xs text-slate-400">{roleLabel}</p>
        </div>

        <nav className="flex flex-col gap-1 px-3 py-4 lg:px-4">
          {items.map((item, idx) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const showSectionHeader = !!item.section && item.section !== items[idx - 1]?.section;
            return (
              <div key={item.href}>
                {showSectionHeader && (
                  <p className={`px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 ${idx > 0 ? "pt-4" : ""}`}>
                    {item.section}
                  </p>
                )}
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{item.icon}</span>
                    {item.label}
                  </span>
                  {!!item.badge && (
                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="px-4 pb-6 pt-2 lg:px-6">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            Se déconnecter
          </button>
        </div>
      </aside>
    </>
  );
}
