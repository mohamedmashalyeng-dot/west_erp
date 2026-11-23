/** Prisma uses mysql://; the underlying MariaDB driver's URI parser uses mariadb://. */
export function mariaDbDriverUrl(value: string): string {
  if (!value.startsWith("mysql://")) throw new Error("Expected a mysql:// database connection.");
  return `mariadb://${value.slice("mysql://".length)}`;
}
