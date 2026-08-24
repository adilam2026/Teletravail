/** Email technique déterministe pour les comptes créés sans adresse réelle. */
export function syntheticEmail(login: string): string {
  return `${login.trim().toLowerCase()}@teletravail.local`;
}
