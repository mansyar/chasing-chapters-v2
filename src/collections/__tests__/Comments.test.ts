import { describe, expect, it, mock } from "bun:test";
import { Comments } from "../Comments";

type HookArgs = {
	data: {
		commenter?: number;
		content?: string;
		status?: string;
		spamSignals?: { signal?: string }[];
	};
	req: { payload: { findByID: ReturnType<typeof mock> } };
	operation: string;
};

const hook = Comments.hooks?.beforeChange?.[0] as unknown as (
	args: HookArgs,
) => Promise<HookArgs["data"] | undefined>;

const baseCommenter = { id: 7, name: "Jane", banned: false, trusted: false };

function makePayload(
	commenter: typeof baseCommenter = baseCommenter,
	failLookup = false,
) {
	return {
		findByID: mock(async (args: { collection: string }) => {
			if (failLookup) throw new Error("not found");
			if (args.collection === "commenters") return commenter;
			throw new Error("unexpected collection");
		}),
	};
}

describe("Comments collection beforeChange hook", () => {
	it("auto-approves clean content from a non-trusted commenter", async () => {
		const data = { commenter: 7, content: "Great review!" };
		const result = await hook({
			data,
			req: { payload: makePayload() },
			operation: "create",
		});
		expect(result?.status).toBe("approved");
	});

	it("holds flagged content from a non-trusted commenter as pending", async () => {
		const data = { commenter: 7, content: "Buy viagra at https://spam.com" };
		const result = await hook({
			data,
			req: { payload: makePayload() },
			operation: "create",
		});
		expect(result?.status).toBe("pending");
		expect(result?.spamSignals?.some((s) => s?.signal?.includes("URL"))).toBe(
			true,
		);
	});

	it("auto-approves flagged content from a trusted commenter (trust bypass)", async () => {
		const payload = makePayload({ ...baseCommenter, trusted: true });
		const data = { commenter: 7, content: "Check https://example.com" };
		const result = await hook({
			data,
			req: { payload },
			operation: "create",
		});
		expect(result?.status).toBe("approved");
	});

	it("throws for a banned commenter without resolving a status", async () => {
		const payload = makePayload({ ...baseCommenter, banned: true });
		const data = { commenter: 7, content: "Great review!" };
		await expect(
			hook({ data, req: { payload }, operation: "create" }),
		).rejects.toThrow("You are not allowed to comment.");
	});

	it("falls back to a non-trusted decision when the commenter lookup fails", async () => {
		const data = { commenter: 404, content: "Buy viagra at https://spam.com" };
		const result = await hook({
			data,
			req: { payload: makePayload(baseCommenter, true) },
			operation: "create",
		});
		expect(result?.status).toBe("pending");
	});

	it("falls back to a non-trusted decision when no commenter is linked", async () => {
		const data = { content: "Buy viagra at https://spam.com" };
		const result = await hook({
			data,
			req: { payload: makePayload() },
			operation: "create",
		});
		expect(result?.status).toBe("pending");
	});

	it("derives the status on create regardless of a submitted value", async () => {
		// The server action's Local API create carries no field-level rule on
		// `status`, so this hook is the only writer of it. A client that
		// submits `approved` still gets the derived decision, which is what
		// keeps guest commenting intact once `create` denies anonymous REST.
		const data = {
			commenter: 7,
			content: "Buy viagra at https://spam.com",
			status: "approved",
		};
		const result = await hook({
			data,
			req: { payload: makePayload() },
			operation: "create",
		});
		expect(result?.status).toBe("pending");
	});
});

type AccessUser = { id: number; role?: string };

type CollectionAccess = (args: {
	req: { user?: AccessUser | null };
	id?: number | string;
	data?: Record<string, unknown>;
}) => unknown;

type FieldUpdateAccess = (args: {
	req: { user?: AccessUser | null };
	id?: number | string;
	data?: Record<string, unknown>;
}) => boolean | Promise<boolean>;

const readAccess = Comments.access?.read as unknown as CollectionAccess;
const createAccess = Comments.access?.create as unknown as CollectionAccess;
const updateAccess = Comments.access?.update as unknown as CollectionAccess;
const deleteAccess = Comments.access?.delete as unknown as CollectionAccess;

/** The `status` field as configured on the collection. */
function statusField() {
	return Comments.fields.find(
		(field) => "name" in field && field.name === "status",
	);
}

/**
 * The field-level `update` access configured on a named field, if any.
 *
 * Payload types the access callback against its full request object; these
 * tests supply only the parts the rule reads, so the narrower shape is
 * asserted rather than threaded through every call site.
 */
function fieldUpdateAccess(name: string): FieldUpdateAccess | undefined {
	const field = Comments.fields.find((f) => "name" in f && f.name === name);

	if (!field || !("access" in field)) return undefined;

	return field.access?.update as unknown as FieldUpdateAccess | undefined;
}

/** The field-level `update` access configured on `status`, if any. */
function statusUpdateAccess() {
	return fieldUpdateAccess("status");
}

/**
 * Applies the collection's field-level update access to a submitted write the
 * way Payload does: a field whose `access.update` returns false is dropped from
 * the write, while the rest of the write still goes through.
 *
 * A field carrying no `access.update` is unrestricted, so it passes.
 */
async function applyFieldAccess(
	data: Record<string, unknown>,
	user: AccessUser | null,
	id: number,
) {
	const write: Record<string, unknown> = {};

	for (const [name, value] of Object.entries(data)) {
		const update = fieldUpdateAccess(name);

		if (update && !(await update({ req: { user }, id, data }))) continue;

		write[name] = value;
	}

	return write;
}

const writer = { id: 5, role: "writer" };
const admin = { id: 1, role: "admin" };

describe("Comments collection create access", () => {
	it("denies an anonymous create", async () => {
		// A REST client with no session reaches this rule directly, so a
		// `POST /api/comments` from anyone used to be accepted.
		expect(await createAccess({ req: { user: null } })).toBe(false);
	});

	it("allows an authenticated create", async () => {
		// The rule denies anonymous callers, not everyone: staff still reach a
		// collection they can legitimately write.
		expect(await createAccess({ req: { user: admin } })).toBe(true);
		expect(await createAccess({ req: { user: writer } })).toBe(true);
	});

	it("leaves the read, update and delete rules unchanged", async () => {
		expect(await readAccess({ req: { user: null } })).toEqual({
			status: { equals: "approved" },
		});
		expect(await updateAccess({ req: { user: null } })).toBe(false);
		expect(await deleteAccess({ req: { user: writer } })).toBe(false);
		expect(await deleteAccess({ req: { user: admin } })).toBe(true);
	});

	it("keeps a writer's read access to comments on their own reviews", async () => {
		// Writers still need to read comments on their reviews for moderation;
		// only approving them moves to an admin.
		expect(await readAccess({ req: { user: writer } })).toEqual({
			"relatedReview.author": { equals: writer.id },
		});
		expect(await readAccess({ req: { user: admin } })).toBe(true);
	});
});

describe("Comments status field access", () => {
	it("denies a writer the status field on a comment they may otherwise update", async () => {
		// The collection rule still lets a writer update comments on their own
		// reviews; only the privileged field is withheld.
		expect(await updateAccess({ req: { user: writer } })).toEqual({
			"relatedReview.author": { equals: writer.id },
		});

		const allowed = await statusUpdateAccess()?.({
			req: { user: writer },
			id: 12,
			data: { status: "approved" },
		});

		expect(allowed).toBe(false);
	});

	it("drops status from a writer's write so approval does not land", async () => {
		const write = await applyFieldAccess({ status: "approved" }, writer, 12);

		// The field is dropped rather than the whole update rejected, so a
		// writer's legitimate moderation edit still lands - without approval.
		expect(write).not.toHaveProperty("status");
		expect(write).toEqual({});
	});

	it("lets an admin approve a comment", async () => {
		const allowed = await statusUpdateAccess()?.({
			req: { user: admin },
			id: 12,
			data: { status: "approved" },
		});

		expect(allowed).toBe(true);

		const write = await applyFieldAccess({ status: "approved" }, admin, 12);

		expect(write).toEqual({ status: "approved" });
	});

	it("leaves the status field unrestricted on create", () => {
		// `access.create` on `status` would let a client choose its own status
		// and could drop the field before the derivation hook sets it.
		const field = statusField();
		const createRule =
			field && "access" in field ? field.access?.create : undefined;

		expect(createRule).toBeUndefined();
	});

	it("keeps the status field required with a pending default", () => {
		expect(statusField()).toMatchObject({
			type: "select",
			required: true,
			defaultValue: "pending",
		});
	});
});
