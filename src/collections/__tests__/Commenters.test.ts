import { describe, expect, it } from "bun:test";
import { Commenters } from "../Commenters";

type AccessUser = { id: number; role?: string };

type CollectionAccess = (args: {
	req: { user?: AccessUser | null };
	id?: number | string;
	data?: Record<string, unknown>;
}) => unknown;

const readAccess = Commenters.access?.read as unknown as CollectionAccess;
const createAccess = Commenters.access?.create as unknown as CollectionAccess;
const updateAccess = Commenters.access?.update as unknown as CollectionAccess;
const deleteAccess = Commenters.access?.delete as unknown as CollectionAccess;

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
