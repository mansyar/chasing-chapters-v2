/**
 * Creates the database the e2e run uses.
 *
 * The suite must never write into the database the developer works in: the
 * fixture rows would compete with the developer's own rows inside the
 * fixed-size windows the public pages use, and the admin specs - which assert
 * collection-wide counts - would turn red on every review the developer leaves
 * in a failed or stale translation state.
 *
 * The e2e database is derived from the ambient `DATABASE_URI` by suffixing the
 * database name (see `resolveE2EDatabaseUri`). This script creates that
 * database if it does not exist yet. It never drops and never truncates
 * anything: an existing e2e database is reused, so a run against a database
 * from an earlier attempt keeps its schema and its rows.
 */
import { resolveE2EDatabaseUri } from "../lib/e2e-harness";

/**
 * The maintenance database every PostgreSQL instance exposes. `CREATE
 * DATABASE` cannot run inside the database it creates, so the connection
 * points at `postgres` instead.
 */
const MAINTENANCE_DATABASE = "postgres";

/**
 * The characters a database name may contain. The name is interpolated into
 * the statement - it cannot be a bind parameter - so anything unexpected is
 * refused instead of quoted.
 */
const SAFE_DATABASE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_$-]*$/;

function fail(message: string): never {
	console.error(`[e2e] ${message}`);
	process.exit(1);
}

const e2eUri = resolveE2EDatabaseUri(process.env);
if (!e2eUri) {
	fail(
		"DATABASE_URI is missing or unusable, so the e2e database cannot be resolved.",
	);
}

// The orchestrator passes the connection string it resolved. If the ambient
// environment disagrees with it - a `.env` file that overrode the variable, for
// example - the run would touch the wrong database, so it stops here.
const expectedUri = process.env.E2E_EXPECTED_DATABASE_URI;
if (expectedUri && process.env.DATABASE_URI?.trim() !== expectedUri) {
	fail(
		`The ambient DATABASE_URI does not point at the e2e database ("${expectedUri}").`,
	);
}

const e2eName = decodeURIComponent(
	new URL(e2eUri).pathname.split("/").filter(Boolean).at(-1) ?? "",
);
if (!SAFE_DATABASE_NAME.test(e2eName)) {
	fail(`The e2e database name "${e2eName}" is not a usable identifier.`);
}

const maintenanceUri = new URL(e2eUri);
maintenanceUri.pathname = `/${MAINTENANCE_DATABASE}`;

// Bun's own SQL client talks to PostgreSQL directly, so the script needs no
// database driver of its own.
const sql = new Bun.SQL(maintenanceUri.toString());

try {
	const existing = await sql<Array<{ exists: number }>>`
		SELECT 1 AS exists FROM pg_database WHERE datname = ${e2eName}
	`;

	if (existing.length > 0) {
		console.log(`[e2e] The database "${e2eName}" already exists.`);
	} else {
		await sql.unsafe(`CREATE DATABASE "${e2eName}"`);
		console.log(`[e2e] Created the database "${e2eName}".`);
	}
} finally {
	await sql.close();
}
