import { describe, expect, it } from "vitest";
import { monthWeeksOwned, weekOwnerMonth } from "@/lib/date/casablanca";

describe("weekOwnerMonth", () => {
  it("assigns a week to the month holding the majority of its 5 weekdays", () => {
    // Lundi 31 août -> vendredi 4 septembre 2026 : 1 jour en août, 4 en septembre.
    expect(weekOwnerMonth("2026-08-31")).toBe("2026-09");
  });

  it("assigns a week entirely inside one month to that month", () => {
    expect(weekOwnerMonth("2026-09-07")).toBe("2026-09");
  });
});

describe("monthWeeksOwned", () => {
  it("never lets the same week appear in two consecutive months", () => {
    const august = monthWeeksOwned("2026-08");
    const september = monthWeeksOwned("2026-09");
    const overlap = august.filter((w) => september.includes(w));
    expect(overlap).toEqual([]);
  });

  it("includes the boundary week (31 août -> 4 septembre) under September, not August", () => {
    const august = monthWeeksOwned("2026-08");
    const september = monthWeeksOwned("2026-09");
    expect(september).toContain("2026-08-31");
    expect(august).not.toContain("2026-08-31");
  });

  it("covers every day of the month exactly once across its owned weeks", () => {
    const weeks = monthWeeksOwned("2026-09");
    // Chaque semaine possédée doit avoir la majorité de ses jours en septembre.
    for (const w of weeks) {
      expect(weekOwnerMonth(w)).toBe("2026-09");
    }
    // Le mois entier doit être couvert (aucun jour de septembre orphelin).
    const covered = new Set<string>();
    for (const w of weeks) {
      const start = new Date(`${w}T00:00:00`);
      for (let i = 0; i < 5; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        covered.add(d.toISOString().slice(0, 10));
      }
    }
    for (let day = 1; day <= 30; day++) {
      const date = `2026-09-${String(day).padStart(2, "0")}`;
      const weekday = new Date(`${date}T00:00:00`).getDay();
      if (weekday === 0 || weekday === 6) continue; // week-end, jamais dans weekDates
      expect(covered.has(date)).toBe(true);
    }
  });

  it("has no duplicates across a full year of consecutive months", () => {
    const seen = new Map<string, string>();
    for (let m = 1; m <= 12; m++) {
      const month = `2026-${String(m).padStart(2, "0")}`;
      for (const w of monthWeeksOwned(month)) {
        expect(seen.has(w)).toBe(false);
        seen.set(w, month);
      }
    }
  });
});
