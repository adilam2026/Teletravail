import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULE_SETTINGS,
  evaluateTeamPresence,
  evaluateWeek,
  resolveWeeklyQuota,
  type EmployeeContext,
  type RuleSettings,
  type WeekEvaluationInput,
} from "@/lib/rules-engine";

// Semaine du 7 au 11 septembre 2026 (lundi -> vendredi), cf. exemple du cahier des charges.
const WEEK_START = "2026-09-07";
const MON = "2026-09-07";
const TUE = "2026-09-08";
const WED = "2026-09-09";
const THU = "2026-09-10";
const FRI = "2026-09-11";

const internalEmployee: EmployeeContext = {
  employeeId: "emp-1",
  employeeType: "internal",
  weeklyQuota: 2,
};

const externalEmployee: EmployeeContext = {
  employeeId: "emp-2",
  employeeType: "external",
  weeklyQuota: 1,
};

function baseInput(overrides: Partial<WeekEvaluationInput> = {}): WeekEvaluationInput {
  return {
    weekStart: WEEK_START,
    selectedDates: [],
    employee: internalEmployee,
    settings: DEFAULT_RULE_SETTINGS,
    holidays: [],
    absences: [],
    exceptions: [],
    ...overrides,
  };
}

describe("Quota hebdomadaire", () => {
  it("interne : 2 jours non adjacents sont acceptés", () => {
    const result = evaluateWeek(baseInput({ selectedDates: [TUE, THU] }));
    expect(result.compliance).toBe("compliant");
    expect(result.canSubmit).toBe(true);
    expect(result.selectedCount).toBe(2);
  });

  it("interne : un 3e jour est proactivement bloqué une fois le quota atteint", () => {
    const result = evaluateWeek(baseInput({ selectedDates: [TUE, THU] }));
    const wed = result.days.find((d) => d.date === WED)!;
    expect(wed.allowed).toBe(false);
    expect(wed.ruleCode).toBe("MAX_WEEKLY_QUOTA");
  });

  it("interne : 3 jours déjà sélectionnés (quota + consécutif désactivés) sont refusés au niveau quota", () => {
    const settings: RuleSettings = {
      ...DEFAULT_RULE_SETTINGS,
      consecutiveDaysForbidden: false,
      mondayFridayForbidden: false,
    };
    const result = evaluateWeek(baseInput({ selectedDates: [MON, TUE, WED], settings }));
    expect(result.compliance).toBe("non_compliant");
    expect(result.canSubmit).toBe(false);
    expect(result.alerts.map((a) => a.ruleCode)).toContain("MAX_WEEKLY_QUOTA");
  });

  it("externe : 1 jour est accepté", () => {
    const result = evaluateWeek(baseInput({ employee: externalEmployee, selectedDates: [WED] }));
    expect(result.compliance).toBe("compliant");
    expect(result.canSubmit).toBe(true);
  });

  it("externe : 2 jours sont refusés", () => {
    const result = evaluateWeek(baseInput({ employee: externalEmployee, selectedDates: [MON, WED] }));
    expect(result.compliance).toBe("non_compliant");
    expect(result.canSubmit).toBe(false);
    expect(result.alerts.map((a) => a.ruleCode)).toContain("MAX_WEEKLY_QUOTA");
  });

  it("le quota individuel exceptionnel prévaut sur le quota standard du type", () => {
    expect(resolveWeeklyQuota("internal", DEFAULT_RULE_SETTINGS, 1)).toBe(1);
    expect(resolveWeeklyQuota("internal", DEFAULT_RULE_SETTINGS, null)).toBe(2);
    expect(resolveWeeklyQuota("external", DEFAULT_RULE_SETTINGS)).toBe(1);
  });
});

describe("Jours consécutifs", () => {
  it("mardi + mercredi sont refusés", () => {
    const settings: RuleSettings = { ...DEFAULT_RULE_SETTINGS, mondayFridayForbidden: false };
    const employee: EmployeeContext = { ...internalEmployee, weeklyQuota: 3 };
    const result = evaluateWeek(baseInput({ employee, selectedDates: [TUE, WED], settings }));
    expect(result.compliance).toBe("non_compliant");
    expect(result.canSubmit).toBe(false);
    expect(result.alerts.map((a) => a.ruleCode)).toContain("CONSECUTIVE_REMOTE_DAYS");
  });

  it("un jour adjacent à un jour déjà sélectionné est proactivement désactivé", () => {
    const result = evaluateWeek(baseInput({ selectedDates: [TUE] }));
    const wed = result.days.find((d) => d.date === WED)!;
    expect(wed.allowed).toBe(false);
    expect(wed.ruleCode).toBe("CONSECUTIVE_REMOTE_DAYS");
  });
});

describe("Combinaison lundi + vendredi", () => {
  it("lundi + vendredi sont refusés même non consécutifs", () => {
    const employee: EmployeeContext = { ...internalEmployee, weeklyQuota: 3 };
    const result = evaluateWeek(baseInput({ employee, selectedDates: [MON, FRI] }));
    expect(result.compliance).toBe("non_compliant");
    expect(result.canSubmit).toBe(false);
    expect(result.alerts.map((a) => a.ruleCode)).toContain("MONDAY_FRIDAY_COMBINATION");
  });

  it("vendredi est proactivement désactivé si lundi est déjà sélectionné", () => {
    const result = evaluateWeek(baseInput({ selectedDates: [MON] }));
    const fri = result.days.find((d) => d.date === FRI)!;
    expect(fri.allowed).toBe(false);
    expect(fri.ruleCode).toBe("MONDAY_FRIDAY_COMBINATION");
  });
});

describe("Reprise après absence", () => {
  it("congé le lundi -> télétravail interdit le mardi", () => {
    const result = evaluateWeek(
      baseInput({
        absences: [{ startDate: MON, endDate: MON, triggersReturnRule: true }],
      })
    );
    const tue = result.days.find((d) => d.date === TUE)!;
    expect(tue.allowed).toBe(false);
    expect(tue.ruleCode).toBe("RETURN_AFTER_ABSENCE");
    expect(tue.reason).toMatch(/reprise après absence/i);
  });

  it("congé le vendredi de la semaine N -> télétravail interdit le lundi N+1 (pont week-end)", () => {
    const prevFriday = "2026-09-04"; // vendredi de la semaine précédente
    const result = evaluateWeek(
      baseInput({
        absences: [{ startDate: prevFriday, endDate: prevFriday, triggersReturnRule: true }],
      })
    );
    const mon = result.days.find((d) => d.date === MON)!;
    expect(mon.allowed).toBe(false);
    expect(mon.ruleCode).toBe("RETURN_AFTER_ABSENCE");
  });

  it("un type d'absence qui ne déclenche pas la règle ne bloque pas la reprise", () => {
    const result = evaluateWeek(
      baseInput({
        absences: [{ startDate: MON, endDate: MON, triggersReturnRule: false }],
      })
    );
    const tue = result.days.find((d) => d.date === TUE)!;
    expect(tue.allowed).toBe(true);
  });

  it("un pont absence -> jour férié -> week-end -> reprise reste bloqué (return_after_bridge_enabled)", () => {
    // Absence le jeudi 10/09, jour férié fictif le vendredi 11/09, week-end 12-13/09 -> reprise lundi 14/09.
    const nextWeekStart = "2026-09-14";
    const result = evaluateWeek(
      baseInput({
        weekStart: nextWeekStart,
        holidays: [{ date: "2026-09-11", name: "Test", status: "confirmed" }],
        absences: [{ startDate: THU, endDate: THU, triggersReturnRule: true }],
      })
    );
    const nextMonday = result.days.find((d) => d.date === "2026-09-14")!;
    expect(nextMonday.allowed).toBe(false);
    expect(nextMonday.ruleCode).toBe("RETURN_AFTER_ABSENCE");
  });
});

describe("Jours fériés", () => {
  it("un jour férié ne peut pas être sélectionné en télétravail", () => {
    const result = evaluateWeek(
      baseInput({ holidays: [{ date: WED, name: "Fête du Travail", status: "confirmed" }] })
    );
    const wed = result.days.find((d) => d.date === WED)!;
    expect(wed.allowed).toBe(false);
    expect(wed.ruleCode).toBe("PUBLIC_HOLIDAY");
  });

  it("un jour férié prévisionnel bloque aussi la sélection, avec un libellé distinct", () => {
    const result = evaluateWeek(
      baseInput({ holidays: [{ date: WED, name: "Aïd Al-Fitr", status: "provisional" }] })
    );
    const wed = result.days.find((d) => d.date === WED)!;
    expect(wed.allowed).toBe(false);
    expect(wed.reason).toMatch(/prévisionnelle/i);
  });
});

describe("Exceptions", () => {
  it("une présence obligatoire bloque le télétravail ce jour-là", () => {
    const result = evaluateWeek(
      baseInput({
        exceptions: [{ startDate: WED, endDate: WED, type: "mandatory_office", name: "Présence obligatoire" }],
      })
    );
    const wed = result.days.find((d) => d.date === WED)!;
    expect(wed.allowed).toBe(false);
    expect(wed.ruleCode).toBe("MANDATORY_OFFICE_DAY");
  });

  it("une autorisation exceptionnelle lève un blocage de jour férié", () => {
    const result = evaluateWeek(
      baseInput({
        holidays: [{ date: WED, name: "Férié", status: "confirmed" }],
        exceptions: [{ startDate: WED, endDate: WED, type: "telework_allowed", name: "Dérogation" }],
      })
    );
    const wed = result.days.find((d) => d.date === WED)!;
    expect(wed.allowed).toBe(true);
  });
});

describe("Rotation des jours", () => {
  it("lève une alerte non bloquante si les mêmes jours reviennent trop souvent", () => {
    const result = evaluateWeek(
      baseInput({
        selectedDates: [TUE, THU],
        priorWeeksSelections: [
          [2, 4],
          [2, 4],
          [2, 4],
          [1, 3],
        ],
      })
    );
    expect(result.alerts.some((a) => a.ruleCode === "ROTATION_WARNING")).toBe(true);
    const rotation = result.alerts.find((a) => a.ruleCode === "ROTATION_WARNING")!;
    expect(rotation.severity).toBe("warning");
    expect(result.canSubmit).toBe(true); // non bloquant par défaut
  });

  it("mode 'block' rend la rotation bloquante", () => {
    const settings: RuleSettings = { ...DEFAULT_RULE_SETTINGS, rotationMode: "block" };
    const result = evaluateWeek(
      baseInput({
        settings,
        selectedDates: [TUE, THU],
        priorWeeksSelections: [
          [2, 4],
          [2, 4],
          [2, 4],
          [2, 4],
        ],
      })
    );
    expect(result.canSubmit).toBe(false);
  });
});

describe("Remplacement intelligent (quota atteint)", () => {
  it("externe : un jour déjà sélectionné se remplace automatiquement (candidat unique)", () => {
    const result = evaluateWeek(baseInput({ employee: externalEmployee, selectedDates: [MON] }));
    const wed = result.days.find((d) => d.date === WED)!;
    expect(wed.allowed).toBe(false);
    expect(wed.ruleCode).toBe("MAX_WEEKLY_QUOTA");
    expect(wed.swapCandidates).toEqual([MON]);
  });

  it("interne 2 jours : un seul des deux jours est un remplacement valide (l'autre créerait un jour consécutif)", () => {
    // Mardi + Jeudi sélectionnés, clic sur Vendredi : retirer Mardi laisserait
    // Jeudi + Vendredi (consécutifs, interdit) ; seul Jeudi est un candidat valide.
    const result = evaluateWeek(baseInput({ selectedDates: [TUE, THU] }));
    const fri = result.days.find((d) => d.date === FRI)!;
    expect(fri.allowed).toBe(false);
    expect(fri.swapCandidates).toEqual([THU]);
  });

  it("aucun remplacement valide -> blocage classique sans swapCandidates", () => {
    // Mardi + Jeudi sélectionnés, clic sur Mercredi : Mercredi est consécutif
    // avec Mardi ET avec Jeudi, donc aucun retrait ne le débloque.
    const result = evaluateWeek(baseInput({ selectedDates: [TUE, THU] }));
    const wed = result.days.find((d) => d.date === WED)!;
    expect(wed.allowed).toBe(false);
    expect(wed.swapCandidates).toBeNull();
    expect(wed.ruleCode).toBe("MAX_WEEKLY_QUOTA");
  });

  it("avec les règles de combinaison désactivées, plusieurs remplacements valides sont proposés au choix", () => {
    const settings: RuleSettings = { ...DEFAULT_RULE_SETTINGS, consecutiveDaysForbidden: false, mondayFridayForbidden: false };
    const result = evaluateWeek(baseInput({ settings, selectedDates: [TUE, THU] }));
    const fri = result.days.find((d) => d.date === FRI)!;
    expect(fri.swapCandidates).toEqual(expect.arrayContaining([TUE, THU]));
    expect(fri.swapCandidates).toHaveLength(2);
  });

  it("le quota a encore de la place : pas de logique de remplacement, simple blocage d'adjacence", () => {
    const employee: EmployeeContext = { ...internalEmployee, weeklyQuota: 3 };
    const result = evaluateWeek(baseInput({ employee, selectedDates: [TUE] }));
    const wed = result.days.find((d) => d.date === WED)!;
    expect(wed.swapCandidates).toBeNull();
    expect(wed.ruleCode).toBe("CONSECUTIVE_REMOTE_DAYS");
  });
});

describe("Présence d'équipe", () => {
  it("calcule le pourcentage de présence au bureau et signale le seuil bas", () => {
    const result = evaluateTeamPresence(
      [THU],
      { [THU]: { officeCount: 5, totalCount: 12 } },
      { teamPresenceMinPercent: 50, teamPresenceMode: "alert" }
    );
    expect(result[0]!.officePercent).toBe(42);
    expect(result[0]!.belowThreshold).toBe(true);
  });
});
