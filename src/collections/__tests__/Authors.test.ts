import { describe, expect, it, mock } from "bun:test";
import { Authors } from "../Authors";

type CreateArgs = {
	collection: string;
	data: {
		key: string;
		value: string;
		user: { relationTo: string; value: number };
	};
	user?: { id: number; collection: string };
	req?: unknown;
};

type AfterLoginArgs = {
	req: { payload: { find: unknown; create: unknown } };
	user: { id: number; collection: string };
};

type AccessUser = { id: number; role?: string };

type CollectionUpdateAccess = (args: {
	req: { user?: AccessUser | null };
	id: number | string;
}) => boolean;

type FieldUpdateAccess = (args: {
	req: { user?: AccessUser | null };
	id?: number | string;
	data?: Record<string, unknown>;
}) => boolean | Promise<boolean>;

const afterLogin = Authors.hooks?.afterLogin?.[0] as unknown as (
	args: AfterLoginArgs,
) => Promise<unknown>;

/** The authenticated author the login hook receives. */
const author = {
	id: 9,
	collection: "authors",
	email: "e2e-admin@example.test",
};

/**
 * A stub of the Local API the hook uses: `find` reports the stored
 * preferences, `create` records the write.
 */
function makePayload(docs: unknown[] = []) {
	return {
		find: mock(async (_args: unknown) => ({ docs })),
		create: mock(async (_args: CreateArgs) => ({ id: 1 })),
	};
}

describe("Authors collection afterLogin hook", () => {
	it("stores the locale preference for the authenticated user", async () => {
		const payload = makePayload();

		const result = await afterLogin({ req: { payload }, user: author });

		expect(result).toBe(author);
		expect(payload.create).toHaveBeenCalledTimes(1);
		// The preferences collection fills its `user` field from `req.user`,
		// so the write has to carry the authenticated user. Without it the
		// required field fails validation and nothing is stored at all.
		expect(payload.create).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "payload-preferences",
				user: expect.objectContaining({ id: 9 }),
			}),
		);
	});

	it("stores the preference inside the login transaction", async () => {
		const payload = makePayload();
		const req = { payload };

		await afterLogin({ req, user: author });

		const [args] = payload.create.mock.calls[0] as [CreateArgs];
		// The write has to join the login transaction. In a transaction of
		// its own the preference's relationship row waits for the lock the
		// login holds on the author row, while the login waits for the
		// write - the request never finishes.
		expect(args.req).toBe(req);
	});

	it("submits the key, the value and the owner of the preference", async () => {
		const payload = makePayload();

		await afterLogin({ req: { payload }, user: author });

		const [args] = payload.create.mock.calls[0] as [CreateArgs];
		// The preferences collection marks `user` as required, so the write
		// names the authenticated author instead of leaving the field to the
		// collection's own hook.
		expect(args.data).toEqual({
			key: "locale",
			value: "en",
			user: { relationTo: "authors", value: 9 },
		});
	});

	it("does not store a second preference when one already exists", async () => {
		const payload = makePayload([{ id: 1, key: "locale" }]);

		await afterLogin({ req: { payload }, user: author });

		expect(payload.create).not.toHaveBeenCalled();
	});
});

/** The `role` field as configured on the collection. */
function roleField() {
	return Authors.fields.find(
		(field) => "name" in field && field.name === "role",
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
	const field = Authors.fields.find((f) => "name" in f && f.name === name);

	if (!field || !("access" in field)) return undefined;

	return field.access?.update as unknown as FieldUpdateAccess | undefined;
}

/** The field-level `update` access configured on `role`, if any. */
function roleUpdateAccess() {
	return fieldUpdateAccess("role");
}

/** The collection-level `update` rule, which permits a writer's self-update. */
const collectionUpdate = Authors.access
	?.update as unknown as CollectionUpdateAccess;

/**
 * Applies the collection's field-level update access to a submitted write the
 * way Payload does: a field whose `access.update` returns false is dropped from
 * the write, while the rest of the write still goes through.
 *
 * On update Payload then restores the field from the stored document, so a
 * required field that is dropped does not fail validation
 * (`dist/fields/hooks/beforeValidate/promise.js:229-244` and
 * `getFallbackValue.js:3-18`). A field carrying no `access.update` is
 * unrestricted, so it passes.
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

describe("Authors role field access", () => {
	it("denies a writer the role field on their own document", async () => {
		// Field-level access is evaluated in addition to the collection rule, so
		// the writer still reaches the document - only `role` is withheld.
		expect(collectionUpdate({ req: { user: writer }, id: writer.id })).toBe(
			true,
		);

		const allowed = await roleUpdateAccess()?.({
			req: { user: writer },
			id: writer.id,
			data: { role: "admin" },
		});

		expect(allowed).toBe(false);
	});

	it("leaves a writer's self-update with role unchanged", async () => {
		const write = await applyFieldAccess(
			{ name: "New name", bio: "New bio", role: "admin" },
			writer,
			writer.id,
		);

		// The escalation is dropped rather than rejected, so the profile edit
		// still lands - without the privileged field.
		expect(write).not.toHaveProperty("role");
		expect(write).toEqual({ name: "New name", bio: "New bio" });
	});

	it("lets an admin set another author's role", async () => {
		const allowed = await roleUpdateAccess()?.({
			req: { user: admin },
			id: writer.id,
			data: { role: "admin" },
		});

		expect(allowed).toBe(true);

		const write = await applyFieldAccess({ role: "admin" }, admin, writer.id);

		expect(write).toEqual({ role: "admin" });
	});

	it("keeps the role field required with a writer default", () => {
		const field = roleField();

		// A writer's update omits `role`; the field stays required for creates.
		expect(field).toMatchObject({
			type: "select",
			required: true,
			defaultValue: "writer",
		});
	});
});
