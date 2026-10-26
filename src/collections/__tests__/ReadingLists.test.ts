import { describe, expect, it } from "bun:test";
import type { Where } from "payload";
import { ReadingLists } from "../ReadingLists";

type AccessUser = { id: number; role?: string };

type CollectionAccess = (args: {
	req: { user?: AccessUser | null };
	id?: number | string;
	data?: Record<string, unknown>;
}) => unknown;

const readAccess = ReadingLists.access?.read as unknown as CollectionAccess;
const createAccess = ReadingLists.access?.create as unknown as CollectionAccess;
const updateAccess = ReadingLists.access?.update as unknown as CollectionAccess;
const deleteAccess = ReadingLists.access?.delete as unknown as CollectionAccess;

const writer = { id: 5, role: "writer" };
const admin = { id: 1, role: "admin" };

/**
 * The `where` a read actually runs, built the way `find` builds it
 * (`node_modules/payload/dist/collections/operations/find.js:75`): the access
 * result is combined with the request's own `where` through `combineQueries`,
 * which ANDs them. A rule returning `true` contributes no constraint at all.
 *
 * `draft: true` does not skip this: `find` composes the access result into
 * `fullWhere` first and only then rewrites the keys for the versions query
 * (`:103-104`), so `?draft=true` is filtered by the same rule.
 */
function effectiveWhere(accessResult: unknown, requested: Where): Where {
	const and: Where[] = [requested];

	if (accessResult !== true && accessResult !== false) {
		and.push(accessResult as Where);
	}

	return { and };
}

/**
 * Whether a `where` admits a row. Only the shapes this collection's rule
 * produces are handled - `and` and `_status: { equals }` - so the test reads
 * the fragment it is given rather than trusting its own idea of it.
 */
function admits(
	where: Where | undefined,
	row: { _status?: string | null },
): boolean {
	if (!where) return true;

	const node = where as Record<string, unknown>;

	if (Array.isArray(node.and)) {
		return (node.and as Where[]).every((child) => admits(child, row));
	}

	const status = node._status as { equals?: string } | undefined;

	if (status && typeof status.equals === "string") {
		return row._status === status.equals;
	}

	return true;
}

/** The fragment an unauthenticated read resolves to, as a query. */
async function anonymousQuery() {
	const access = await readAccess({ req: { user: null } });
	return effectiveWhere(access, { slug: { equals: "cozy-reads" } });
}

describe("ReadingLists collection read access", () => {
	it("excludes drafts from an unauthenticated read", async () => {
		// `versions.drafts` is on, so a reading list has a `_status`. Without a
		// constraint here the REST surface served `?draft=true` to anyone - the
		// only collection in the app where that was true.
		expect(await readAccess({ req: { user: null } })).toEqual({
			_status: { equals: "published" },
		});
	});

	it("admits no draft row through the query it produces", async () => {
		const query = await anonymousQuery();

		// The defect, stated as behaviour rather than as shape: a draft row must
		// not survive the query an anonymous read runs.
		expect(admits(query, { _status: "draft" })).toBe(false);
		expect(admits(query, { _status: "published" })).toBe(true);
	});

	it("keeps the constraint on a draft query", async () => {
		// `?draft=true` is the reproduction in the spec. The access result does
		// not depend on the request, and `find` ANDs it into the version query,
		// so asking for drafts cannot lift the constraint.
		const query = await anonymousQuery();

		expect(admits(query, { _status: "draft" })).toBe(false);
		expect(admits(query, { _status: "published" })).toBe(true);
	});

	it("returns the draft to an admin", async () => {
		// The admin panel reads through this rule, so `true` is what keeps a
		// draft editable. A rule that scoped every caller would hide the
		// document from the person writing it.
		expect(await readAccess({ req: { user: admin } })).toBe(true);
	});

	it("gives a writer their own reading lists", async () => {
		// Consistency with `Reviews.read`, not a requirement of this phase:
		// writers may create and edit their own lists, so a writer branch keeps
		// their drafts reachable in the admin panel. Without it the admin list
		// is empty for them, because none of their lists is published.
		expect(await readAccess({ req: { user: writer } })).toEqual({
			author: { equals: writer.id },
		});
	});

	it("uses a status constraint rather than the review schedule fragment", () => {
		// Reading lists carry no `publishAt`, so `publishedAndVisibleWhere`
		// would name a field this collection does not have. The returned
		// fragment is deliberately `_status` alone.
		const rule = ReadingLists.access?.read as unknown as (args: {
			req: { user?: AccessUser | null };
		}) => unknown;
		const fragment = rule({ req: { user: null } }) as Record<string, unknown>;

		expect(fragment).not.toHaveProperty("publishAt");
		expect(fragment).not.toHaveProperty("and");
	});

	it("leaves drafts enabled and the write rules unchanged", async () => {
		// Drafts are the feature; who may read them was the defect.
		expect(ReadingLists.versions).toEqual({ drafts: true });

		expect(await createAccess({ req: { user: null } })).toBe(false);
		expect(await createAccess({ req: { user: writer } })).toBe(true);

		expect(await updateAccess({ req: { user: null } })).toBe(false);
		expect(await updateAccess({ req: { user: admin } })).toBe(true);
		expect(await updateAccess({ req: { user: writer } })).toEqual({
			author: { equals: writer.id },
		});

		expect(await deleteAccess({ req: { user: null } })).toBe(false);
		expect(await deleteAccess({ req: { user: admin } })).toBe(true);
		expect(await deleteAccess({ req: { user: writer } })).toEqual({
			author: { equals: writer.id },
		});
	});
});
