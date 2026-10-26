import { describe, expect, it, mock } from "bun:test";
import { Commenters } from "../Commenters";
import { Comments } from "../Comments";

type AccessUser = { id: number; role?: string };

type CollectionAccess = (args: {
	req: { user?: AccessUser | null };
	id?: number | string;
	data?: Record<string, unknown>;
}) => unknown;

type FieldAccess = (args: {
	req: { user?: AccessUser | null };
	id?: number | string;
	data?: Record<string, unknown>;
}) => boolean | Promise<boolean>;

const readAccess = Commenters.access?.read as unknown as CollectionAccess;
const createAccess = Commenters.access?.create as unknown as CollectionAccess;
const updateAccess = Commenters.access?.update as unknown as CollectionAccess;
const deleteAccess = Commenters.access?.delete as unknown as CollectionAccess;

/**
 * The field-level `create` or `update` access configured on a named field.
 *
 * Payload types the access callback against its full request object; these
 * tests supply only the parts the rule reads, so the narrower shape is
 * asserted rather than threaded through every call site.
 */
function fieldAccess(
	name: string,
	operation: "create" | "update",
): FieldAccess | undefined {
	const field = Commenters.fields.find((f) => "name" in f && f.name === name);

	if (!field || !("access" in field)) return undefined;

	return field.access?.[operation] as unknown as FieldAccess | undefined;
}

/**
 * Applies the collection's field-level create access to a submitted write the
 * way Payload does: a field whose rule returns false is dropped from the write
 * and falls back to its default, while the rest of the write still goes
 * through.
 */
async function applyCreateFieldAccess(
	data: Record<string, unknown>,
	user: AccessUser | null,
) {
	const write: Record<string, unknown> = {};

	for (const [name, value] of Object.entries(data)) {
		const rule = fieldAccess(name, "create");

		if (rule && !(await rule({ req: { user }, data }))) continue;

		write[name] = value;
	}

	return write;
}

const writer = { id: 5, role: "writer" };
const admin = { id: 1, role: "admin" };

describe("Commenters collection create access", () => {
	it("denies an anonymous create", async () => {
		// This is the first half of the trusted-commenter chain. A REST client
		// with no session could mint a row carrying `trusted: true`, and
		// `Comments.beforeChange` reads that flag to decide whether to skip the
		// spam hold - so an open create rule handed out auto-approval.
		expect(await createAccess({ req: { user: null } })).toBe(false);
	});

	it("allows an authenticated create", async () => {
		// The rule denies anonymous callers, not everyone: staff still reach a
		// collection whose read, update and delete rules they already hold.
		expect(await createAccess({ req: { user: admin } })).toBe(true);
		expect(await createAccess({ req: { user: writer } })).toBe(true);
	});

	it("leaves the read, update and delete rules admin-only", async () => {
		// Commenters carry `trusted` and `banned`, which the moderation policy
		// reads. These three rules are the only other guard on those flags, so
		// they are asserted rather than assumed.
		expect(await readAccess({ req: { user: null } })).toBe(false);
		expect(await readAccess({ req: { user: writer } })).toBe(false);
		expect(await readAccess({ req: { user: admin } })).toBe(true);

		expect(await updateAccess({ req: { user: null } })).toBe(false);
		expect(await updateAccess({ req: { user: writer } })).toBe(false);
		expect(await updateAccess({ req: { user: admin } })).toBe(true);

		expect(await deleteAccess({ req: { user: null } })).toBe(false);
		expect(await deleteAccess({ req: { user: writer } })).toBe(false);
		expect(await deleteAccess({ req: { user: admin } })).toBe(true);
	});
});

describe("Commenters moderation field access", () => {
	it("denies a writer both flags on create and on update", async () => {
		// The collection `create` rule above admits any authenticated caller,
		// so these two field rules are what stop a writer from minting a row
		// with `trusted: true` and then commenting through it - the same chain
		// an anonymous caller used before the collection rule was closed.
		for (const name of ["trusted", "banned"] as const) {
			for (const operation of ["create", "update"] as const) {
				const rule = fieldAccess(name, operation);

				expect(typeof rule).toBe("function");
				expect(await rule?.({ req: { user: writer } })).toBe(false);
				expect(await rule?.({ req: { user: null } })).toBe(false);
				expect(await rule?.({ req: { user: admin } })).toBe(true);
			}
		}
	});

	it("drops both flags from a writer's create so the row lands untrusted", async () => {
		// Payload deletes a denied field from the write rather than rejecting
		// the document, and the field's `defaultValue: false` then applies.
		const write = await applyCreateFieldAccess(
			{ name: "x", emailHash: "abc123", trusted: true, banned: true },
			writer,
		);

		expect(write).toEqual({ name: "x", emailHash: "abc123" });
	});

	it("lets an admin set both flags", async () => {
		const write = await applyCreateFieldAccess(
			{ name: "x", emailHash: "abc123", trusted: true, banned: true },
			admin,
		);

		expect(write).toEqual({
			name: "x",
			emailHash: "abc123",
			trusted: true,
			banned: true,
		});
	});

	it("still lets the approval hook raise `trusted` through the Local API", async () => {
		// The one path that legitimately sets `trusted` without an admin is
		// `Comments.afterChange`, which promotes a commenter once three
		// comments are approved. It writes through `payload.update`, whose
		// Local API signature defaults `overrideAccess` to true, so the field
		// rule is not consulted - pinned here rather than assumed, because a
		// field rule that did apply would silently stop the promotion.
		const update = mock(async () => ({ id: 7 }));
		const findByID = mock(async () => ({
			id: 7,
			approvedCommentCount: 2,
			trusted: false,
		}));

		const afterChange = Comments.hooks?.afterChange?.[0] as unknown as (args: {
			doc: { status: string; commenter: number };
			previousDoc: { status: string };
			operation: string;
			req: { payload: { findByID: typeof findByID; update: typeof update } };
		}) => Promise<void>;

		await afterChange({
			doc: { status: "approved", commenter: 7 },
			previousDoc: { status: "pending" },
			operation: "update",
			req: { payload: { findByID, update } },
		});

		expect(update).toHaveBeenCalledTimes(1);
		const [args] = update.mock.calls[0] as unknown as [
			{ collection: string; data: Record<string, unknown> },
		];

		expect(args.collection).toBe("commenters");
		expect(args.data).toEqual({ approvedCommentCount: 3, trusted: true });
		expect(args).not.toHaveProperty("overrideAccess");
		expect(args).not.toHaveProperty("user");
	});
});
