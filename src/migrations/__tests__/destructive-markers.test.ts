import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * `AC-2`/`AC-3`/`AC-4`: a migration may only destroy schema in `up` when the
 * file says why.
 *
 * `20261023_193922` dropped ten columns while the image that still read them
 * stayed deployed, and nothing in the pipeline noticed. The migration chain is
 * forward-only in production, so a drop in `up` is permanent for any image
 * already serving traffic; the justification is what forces that cost into the
 * review instead of into an incident.
 *
 * `down` is exempt on purpose: reverting is the one place a drop belongs, which
 * is why the scan stops at `export async function down`.
 */
const MIGRATIONS_DIRECTORY = join(process.cwd(), "src/migrations");

/** Statements that remove structure a deployed image may still be reading. */
const DESTRUCTIVE_STATEMENT = /\bDROP\s+(?:COLUMN|TABLE)\b|\bTRUNCATE\b/i;

/** Where the reversible half of a migration begins. */
const DOWN_FUNCTION = /export\s+async\s+function\s+down\b/;

/** A whole-line justification — the only thing that silences the scan. */
const MARKER = /^\s*\/\/\s*destructive:\s*\S.*$/m;

type Migration = {
	name: string;
	source: string;
};

/**
 * The `up` half of a migration file: everything before its `down` function.
 *
 * The two halves are one file, so a textual scan without this split would flag
 * every ordinary migration — most of them drop in `down` and nowhere else.
 */
function upBody(source: string): string {
	const down = source.search(DOWN_FUNCTION);

	return down === -1 ? source : source.slice(0, down);
}

/**
 * The source with SQL comments removed.
 *
 * A note about the shape a statement replaced (`-- DROP TABLE "reviews"`) is
 * documentation, not DDL, so it must not demand a marker. Only `--` and block
 * comments are SQL; the `// destructive:` marker is JavaScript and survives.
 */
function withoutSqlComments(sqlSource: string): string {
	return sqlSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

/** The lines in the `up` body that destroy schema. */
function destructiveStatements(source: string): string[] {
	return withoutSqlComments(upBody(source))
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => DESTRUCTIVE_STATEMENT.test(line));
}

/** Whether the file declares itself destructive. */
function hasDestructiveMarker(source: string): boolean {
	return MARKER.test(source);
}

/**
 * The statements that need a marker: a destructive `up` body with none.
 *
 * Empty means the migration is fine — either it destroys nothing, or it says
 * why it does.
 */
function unjustifiedStatements(source: string): string[] {
	return hasDestructiveMarker(source) ? [] : destructiveStatements(source);
}

/** A fixture migration carrying the marker a real one would need. */
function withMarker(source: string): string {
	const marker = "// destructive: the fixture drops a column on purpose";

	return source.replace(
		"export async function up",
		`${marker}\nexport async function up`,
	);
}

const directoryEntries = (await readdir(MIGRATIONS_DIRECTORY)).sort();

/**
 * Every migration file on disk, read as text.
 *
 * `index.ts` is the ordered registry rather than a migration, and the `.json`
 * files beside it are drizzle snapshots; neither has an `up` body to inspect.
 */
const migrations: Migration[] = await Promise.all(
	directoryEntries
		.filter((entry) => entry.endsWith(".ts") && entry !== "index.ts")
		.map(async (name) => ({
			name,
			source: await Bun.file(join(MIGRATIONS_DIRECTORY, name)).text(),
		})),
);

// A migration that drops a column in `up` and declares nothing: the shape that
// cost production ten hours.
const UNMARKED_DROP = `
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql\`
		ALTER TABLE "reviews" DROP COLUMN "title";
	\`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql\`
		ALTER TABLE "reviews" ADD COLUMN "title" varchar;
	\`);
}
`;

// The same reversal kept where it belongs: `up` only adds, `down` destroys.
const DOWN_ONLY_DROP = `
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql\`
		ALTER TABLE "reviews" ADD COLUMN "views" numeric DEFAULT 0;
	\`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql\`
		ALTER TABLE "reviews" DROP COLUMN "views";
		DROP TABLE "reviews_locales" CASCADE;
		TRUNCATE "reviews";
	\`);
}
`;

// Statements that loosen a constraint or remove rows, not structure.
const RELAXED = `
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql\`
		ALTER TABLE "genres_locales" ALTER COLUMN "name" DROP NOT NULL;
		ALTER TABLE "genres" DROP CONSTRAINT "genres_name_fk";
		ALTER TABLE "media" ALTER COLUMN "blur_data_u_r_l" DROP DEFAULT;
		DELETE FROM "reviews" WHERE "id" = 1;
	\`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {}
`;

// SQL is case-insensitive, so the scan is too.
const LOWER_CASE = `
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql\`
		alter table "reviews" drop column "title";
		truncate "comments";
	\`);
}
`;

// A note about the shape a statement replaced is not the statement.
const COMMENTED_OUT = `
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql\`
		-- DROP TABLE "reviews"; the old shape, replaced by an ALTER below
		/* TRUNCATE "comments"; */
		ALTER TABLE "reviews" ADD COLUMN "views" numeric DEFAULT 0;
	\`);
}
`;

describe("destructive migration markers", () => {
	it("inspects every committed migration and no snapshot", () => {
		// A scan that silently matched nothing would make every assertion below
		// pass for the wrong reason, so the count is asserted instead of assumed.
		expect(migrations.length).toBeGreaterThanOrEqual(13);
		expect(directoryEntries.some((entry) => entry.endsWith(".json"))).toBe(true);
		expect(migrations.some((migration) => migration.name === "index.ts")).toBe(
			false,
		);
		expect(
			migrations.every((migration) => migration.name.endsWith(".ts")),
		).toBe(true);
	});

	it("requires a justification for every destructive up body", () => {
		const offenders = migrations.flatMap((migration) =>
			unjustifiedStatements(migration.source).map(
				(statement) => `${migration.name}: ${statement}`,
			),
		);

		expect(offenders).toEqual([]);
	});

	it("marks the three migrations that drop in up", () => {
		// `FR-3`: a file that already destroys schema names what it destroys and
		// why it cannot come back, so a reader meets the reason before the drop.
		const expected = [
			"20251214_135240.ts",
			"20261008_131000_commenters_email_hash_fix.ts",
			"20261023_193922_localize_taxonomy_and_reading_list_content.ts",
		];

		for (const name of expected) {
			const migration = migrations.find((candidate) => candidate.name === name);

			if (!migration) {
				throw new Error(`${name} is missing from src/migrations`);
			}

			expect(destructiveStatements(migration.source).length).toBeGreaterThan(0);
			expect(hasDestructiveMarker(migration.source)).toBe(true);
		}
	});

	it("flags an unmarked up that drops a column", () => {
		// `AC-2`: the marker is the whole gate, so its absence has to be visible.
		expect(hasDestructiveMarker(UNMARKED_DROP)).toBe(false);
		expect(unjustifiedStatements(UNMARKED_DROP)).toEqual([
			'ALTER TABLE "reviews" DROP COLUMN "title";',
		]);
	});

	it("accepts the same migration once it carries a marker", () => {
		expect(unjustifiedStatements(withMarker(UNMARKED_DROP))).toEqual([]);
	});

	it("ignores a drop that appears only in down", () => {
		// `AC-3`: reverting is the one place a drop belongs. Splitting at
		// `export async function down` is what keeps the two halves apart.
		expect(DOWN_ONLY_DROP).toContain("DROP TABLE");
		expect(unjustifiedStatements(DOWN_ONLY_DROP)).toEqual([]);
	});

	it("does not treat a relaxed or re-pointed column as destructive", () => {
		// `DROP NOT NULL`, `DROP CONSTRAINT` and `DROP DEFAULT` change no
		// structure, and `DELETE FROM` is DML: `20261023_195302` relaxes three
		// columns and must keep passing.
		expect(unjustifiedStatements(RELAXED)).toEqual([]);
	});

	it("does not flag the relaxation migration", () => {
		const migration = migrations.find((candidate) =>
			candidate.name.startsWith("20261023_195302"),
		);

		if (!migration) {
			throw new Error("20261023_195302 is missing from src/migrations");
		}

		expect(unjustifiedStatements(migration.source)).toEqual([]);
	});

	it("finds a lower-case drop and a truncate", () => {
		expect(destructiveStatements(LOWER_CASE)).toHaveLength(2);
	});

	it("ignores a destructive keyword inside a SQL comment", () => {
		expect(destructiveStatements(COMMENTED_OUT)).toEqual([]);
	});
});
