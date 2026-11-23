# MySQL / MariaDB deployment

The application now uses Prisma 7's `mysql` provider and `@prisma/adapter-mariadb`. Use MySQL 8+ or MariaDB 10.11+. IDs remain UUID strings, stored as `CHAR(36)`. Money remains decimal, timestamps use millisecond precision, long notes and tokens use `LONGTEXT`, and `Lead.priorityFactors` is a JSON array. Tables use `utf8mb4_unicode_ci`, providing case-insensitive searches and Arabic text support.

## Hostinger connection

Set `DATABASE_URL` in the application's environment using the MySQL connection provided by Hostinger. Do not commit the value or send it in chat. `mysql://USER:PASSWORD@localhost:3306/DATABASE` refers to the database on the server running the app. That localhost address cannot be used from a separate development computer to inspect the hosted database. Use a host permitted for remote access or run these commands on the application server.

Prisma, bootstrap, seed and development scripts load `.env.local` with the same precedence as Next.js. Hosting environment variables take priority. A stale PostgreSQL `DATABASE_URL_UNPOOLED` is no longer read. Keep the existing authentication and Facebook variables.

## Existing imported database: verify before adopting

Take a current backup of the existing database before changing its schema. This process does not import or convert PostgreSQL rows; it connects the app to the MySQL tables already imported into Hostinger.

1. Install dependencies and inspect the actual server and tables with `npm run db:inspect`. This performs read-only queries and never prints credentials.
2. Run `npm run db:baseline:check`. It compares the existing database with `prisma/mysql-baseline.prisma`, the historical schema before Facebook. Exit code 0 means a match, 2 means differences, and 1 means an error. It does not apply SQL.
3. If the database matches, run `npm run db:baseline`. This repeats the comparison and then marks `20261123150000_mysql_init` as applied. It writes migration metadata, without recreating tables or changing application records.
4. Run `npm run db:deploy`. Only the subsequent Facebook migration should be pending; it adds four nullable settings columns and a unique Page index.
5. Deploy the application from GitHub `main` using `npm run build`. `npm run vercel-build` is an alias. Both generate the Prisma client, apply pending migrations, run the optional bootstrap and build Next.js.

If the baseline comparison reports differences, do not mark it applied and do not reset the database. Review its structure and prepare a migration that preserves those particular tables and values. A database with unrelated tables, differing ID types, table names, or converted column types is not automatically compatible just because it is MySQL. A database already managed by a different migration history also needs review before adoption. The build will fail on an unbaselined, nonempty database rather than erase it.

For an empty application database, `npm run build` applies both MySQL migrations and creates the schema. The bootstrap creates an organization/owner only when the `BOOTSTRAP_OWNER_*` variables are set; existing users keep their passwords. Demo seeding is a separate development action, not part of production deployment.

The old PostgreSQL SQL files are retained in `prisma/postgresql-migrations` for reference and are never applied by the MySQL configuration. Do not run them against MySQL. The immutable baseline snapshot is a comparison artifact; make future application changes in `prisma/schema.prisma` and new migrations.

## Local development and tests

Use a separate local MySQL/MariaDB database and credentials. On Windows, extract a portable MariaDB distribution, set `MYSQL_BIN_DIR` to its `bin` directory, and run `npm run db:start`. The development instance binds only to `127.0.0.1`, uses port 3307, and stores files in ignored `.mysql-data`. Set your local `DATABASE_URL` to its development database; do not overwrite the production Hostinger connection with these local settings.

Alternatively, supply `TEST_DATABASE_URL` for an already running test server. It must name a database starting with `test_` or ending with `_test`. Tests never fall back to production `DATABASE_URL`. The schema-adoption tests additionally require permission to create and drop their own disposable databases ending with `_test`. Run `npm test` and `npm run verify`. To validate the deployment pipeline against the development database, run `npm run build`; use `npm run build:app` for compilation only.

`npm run db:stop` stops only the local development instance. It does not delete the data directory. MySQL enforces restrictive foreign keys immediately; deleting an organization that still has sales/reservations or role references can be rejected. Remove or transfer dependent records explicitly through an appropriate workflow rather than disabling foreign key checks.

## References

- [Prisma MySQL/MariaDB connector](https://docs.prisma.io/docs/orm/v6/overview/databases/mysql)
- [Provider-specific migration histories](https://docs.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues)
- [Prisma baselining](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining)
