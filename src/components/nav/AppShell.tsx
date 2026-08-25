import type { ReactNode } from "react";
import { NavSidebar, type NavItem } from "./NavSidebar";

export interface AppShellProps {
  roleLabel: string;
  userName: string;
  items: NavItem[];
  children: ReactNode;
}

export function AppShell({ roleLabel, userName, items, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <NavSidebar items={items} userName={userName} roleLabel={roleLabel} />
      <main className="flex-1 px-4 pb-16 pt-6 lg:px-8 lg:pb-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
