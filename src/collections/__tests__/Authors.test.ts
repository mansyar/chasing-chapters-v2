import { describe, expect, it, mock } from "bun:test";
import { Authors } from "../Authors";

type CreateArgs = {
	collection: string;
	data: { key: string; value: string };
	user?: { id: number; collection: string };
	req?: unknown;
};

type AfterLoginArgs = {
	req: { payload: { find: unknown; create: unknown } };
	user: { id: number; collection: string };
};

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

	it("submits the key and the value of the preference", async () => {
		const payload = makePayload();

		await afterLogin({ req: { payload }, user: author });

		const [args] = payload.create.mock.calls[0] as [CreateArgs];
		expect(args.data).toEqual({ key: "locale", value: "en" });
	});

	it("does not store a second preference when one already exists", async () => {
		const payload = makePayload([{ id: 1, key: "locale" }]);

		await afterLogin({ req: { payload }, user: author });

		expect(payload.create).not.toHaveBeenCalled();
	});
});
