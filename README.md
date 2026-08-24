# Télétravail

Application web de planification, contrôle et validation du télétravail.

## 1. Architecture

- **Frontend / application** : Next.js 14 (App Router, React 18, TypeScript), Tailwind CSS
- **Hébergement** : Vercel
- **Base de données** : Supabase PostgreSQL
- **Authentification** : Supabase Auth (email/mot de passe, identifiant applicatif "login" résolu côté serveur en email technique)
- **Backend** : Server Actions + Server Components Next.js exclusivement — aucun service Railway n'est nécessaire, tout tient dans Vercel + Supabase
- **Fuseau horaire métier** : `Africa/Casablanca` (voir `src/lib/date/casablanca.ts`)

Aucune brique complémentaire (queue, cron externe, service séparé) n'est nécessaire pour le périmètre décrit : les Server Actions suffisent pour toutes les écritures, et Postgres/RLS assure la sécurité des données.

## 2. Schéma de base de données

Voir `supabase/migrations/`:

- `0001_schema.sql` — tables (`profiles`, `teams`, `rule_overrides`, `weekly_plans`, `telework_days`, `absences`, `absence_types`, `public_holidays`, `company_exceptions`, `telework_rules`, `app_settings`, `notifications`, `audit_logs`)
- `0002_rls.sql` — Row Level Security sur toutes les tables + fonctions `security definer` (`is_admin`, `is_manager_of`, ...) + triggers de garde-fou (`profiles_guard`, `weekly_plans_guard`) qui empêchent toute élévation de privilège même si une policy `USING`/`WITH CHECK` était mal calibrée
- `0003_seed.sql` — paramètres par défaut du moteur de règles, types d'absence, jours fériés marocains (dates fixes 2025-2027) et fêtes religieuses **prévisionnelles** à confirmer par un administrateur

### Simplifications assumées par rapport à l'énoncé

- `team_members` / `manager_relations` sont fusionnées dans `profiles.team_id` / `profiles.manager_id` + `teams.manager_id` (une équipe = un manager). C'est suffisant pour la hiérarchie à 3 niveaux demandée et évite une table de jointure inutile.
- Les statuts "Soumise" et "En attente de validation" (section 16) sont un seul statut `submitted` : les deux libellés de l'énoncé décrivent le même état du point de vue du système (la soumission déclenche immédiatement l'attente de validation). L'UI affiche "En attente de validation".

## 3. Sécurité (RLS)

- Un **collaborateur** ne voit/modifie que ses propres lignes (`employee_id = auth.uid()` ou `id = auth.uid()`).
- Un **manager** voit/modifie les collaborateurs dont `team_id` pointe vers une équipe où `teams.manager_id = auth.uid()` (fonction `is_manager_of`). Il ne peut jamais accéder à une autre équipe.
- Un **administrateur** (`is_admin()`) a accès à tout.
- Les tables de référence (jours fériés, règles, exceptions, types d'absence) sont lisibles par tout utilisateur connecté et modifiables uniquement par un administrateur.
- Les mutations de statut d'une semaine sont contraintes par un trigger (`weekly_plans_guard`) : un collaborateur ne peut agir que sur une semaine `draft`/`needs_changes`, un manager que sur une semaine `submitted` (validation/refus/demande de modification) ou pour rouvrir une semaine `validated`.
- Le `service role` Supabase (qui contourne RLS) n'est utilisé **que** pour la gestion du cycle de vie des comptes Auth (création, réinitialisation de mot de passe), car ces opérations exigent l'API Admin. Chaque appel revalide d'abord les droits métier côté serveur avant d'y recourir.

## 4. Moteur de règles (`src/lib/rules-engine`)

Logique **unique**, testée (`tests/rules-engine.test.ts`), utilisée à la fois par l'agenda collaborateur (désactivation proactive des jours), le tableau manager (badges de conformité) et les Server Actions (revalidation serveur avant toute écriture) — aucune règle n'est dupliquée entre écrans.

`evaluateWeek(...)` retourne, pour chaque jour, `{ allowed, reason, ruleCode, severity }` ainsi qu'un résumé de semaine (`compliance`, `alerts`, `canSubmit`). Codes de règle : `MAX_WEEKLY_QUOTA`, `CONSECUTIVE_REMOTE_DAYS`, `MONDAY_FRIDAY_COMBINATION`, `RETURN_AFTER_ABSENCE`, `PUBLIC_HOLIDAY`, `MANDATORY_OFFICE_DAY`, `ROTATION_WARNING`, `TEAM_PRESENCE_WARNING`, `SUBMISSION_DEADLINE_PASSED`.

Règles couvertes (section 46 du cahier des charges) : quotas interne/externe, jours consécutifs, lundi+vendredi, reprise après absence (y compris à travers un week-end et/ou un jour férié — recherche du prochain jour ouvré, pas seulement à l'intérieur de la semaine), jours fériés (bloquants, y compris prévisionnels), exceptions (présence obligatoire / autorisation exceptionnelle qui lève un blocage), rotation des jours (alerte non bloquante par défaut, configurable), présence d'équipe.

## 5. Écrans

| Rôle | Écrans |
|---|---|
| Collaborateur | Agenda (semaine + mois), Mes semaines, Mes absences, Historique, Profil |
| Manager | Mon équipe, Planning équipe, À valider (avec validation en masse), Absences, Historique, Profil |
| Administrateur | Dashboard, Utilisateurs (tous rôles), Équipes, Planning global, Jours fériés, Absences, Règles télétravail, Exceptions, Historique, Paramètres |

## 6. Déploiement

1. Créer un projet Supabase, exécuter les migrations dans l'ordre (`supabase db push` ou copier/coller dans le SQL Editor).
2. Créer le premier administrateur :
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
     node scripts/bootstrap-admin.mjs "Adil" "Nom" adil adil@exemple.com
   ```
3. Déployer sur Vercel avec les variables d'environnement (`.env.example`) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Se connecter avec l'identifiant admin créé, changer le mot de passe (obligatoire au premier login), puis créer les managers et équipes depuis Administration > Utilisateurs / Équipes.

## 7. Développement local

```bash
npm install
cp .env.example .env.local   # renseigner les clés Supabase
npm run dev
npm run test        # moteur de règles
npm run typecheck
npm run lint
npm run build
```

## 8. Suivi / limites connues du MVP

- Les notifications sont stockées en base (table `notifications`, prêtes pour un futur envoi email) mais aucun email n'est envoyé pour l'instant, conformément au périmètre demandé.
- L'intégration RH n'est pas prévue dans ce MVP ; le module absences est conçu pour un import futur (`absences.source = 'rh_import'`).
- Les dates des fêtes religieuses sont **prévisionnelles** et doivent être vérifiées/confirmées chaque année par un administrateur (Administration > Jours fériés).
- `next` est figé sur la branche 14.2.x (dernier correctif de sécurité disponible sur cette branche) plutôt que la v15/16, pour rester compatible avec l'ensemble de l'implémentation Server Actions utilisée ici ; une montée de version majeure est recommandée avant une mise en production à fort trafic.
