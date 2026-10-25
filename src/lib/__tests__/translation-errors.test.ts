import { describe, expect, test } from "bun:test";
import { TranslationError } from "../translate";
import {
	classifyTranslationError,
	extractProviderErrorDetails,
	formatTranslationError,
	isRetryable,
	isTransientTranslationError,
	TRANSLATION_ERROR_KINDS,
} from "../translation-errors";

describe("classifyTranslationError", () => {
	describe("Google ApiError-like errors (numeric code)", () => {
		test("429 RESOURCE_EXHAUSTED is quota", () => {
			const classified = classifyTranslationError({
				code: 429,
				message: "RESOURCE_EXHAUSTED: Quota exceeded for quota metric",
			});
			expect(classified.kind).toBe("quota");
			expect(classified.transient).toBe(true);
		});

		test("403 with quota message is quota", () => {
			const classified = classifyTranslationError({
				code: 403,
				message: "Daily quota exceeded for project",
			});
			expect(classified.kind).toBe("quota");
			expect(classified.transient).toBe(true);
		});

		test("403 without quota message is credentials", () => {
			const classified = classifyTranslationError({
				code: 403,
				message: "Permission denied on Cloud Translation API",
			});
			expect(classified.kind).toBe("credentials");
			expect(classified.transient).toBe(false);
		});

		test("401 is credentials", () => {
			const classified = classifyTranslationError({
				code: 401,
				message: "Unauthorized",
			});
			expect(classified.kind).toBe("credentials");
			expect(classified.transient).toBe(false);
		});

		test("408 is timeout", () => {
			const classified = classifyTranslationError({
				code: 408,
				message: "Request timeout",
			});
			expect(classified.kind).toBe("timeout");
			expect(classified.transient).toBe(true);
		});

		test("5xx is network", () => {
			for (const code of [500, 502, 503]) {
				const classified = classifyTranslationError({
					code,
					message: "Backend unavailable",
				});
				expect(classified.kind).toBe("network");
				expect(classified.transient).toBe(true);
			}
		});

		test("unrecognized ApiError code falls back to message patterns", () => {
			const classified = classifyTranslationError({
				code: 400,
				message: "API key not valid. Please pass a valid API key.",
			});
			expect(classified.kind).toBe("credentials");
			expect(classified.transient).toBe(false);
		});
	});

	describe("plain errors classified by message", () => {
		test("connection errors are network", () => {
			const classified = classifyTranslationError(
				new Error("getaddrinfo ENOTFOUND translate.googleapis.com"),
			);
			expect(classified.kind).toBe("network");
			expect(classified.transient).toBe(true);
		});

		test("timeout errors are timeout", () => {
			const classified = classifyTranslationError(
				new Error("Translation request timed out after 30 seconds"),
			);
			expect(classified.kind).toBe("timeout");
			expect(classified.transient).toBe(true);
		});

		test("quota strings are quota", () => {
			const classified = classifyTranslationError(
				new Error("Quota exceeded for quota group"),
			);
			expect(classified.kind).toBe("quota");
			expect(classified.transient).toBe(true);
		});

		test("invalid credentials strings are credentials", () => {
			const classified = classifyTranslationError(
				new Error(
					"invalid credentials: Could not load the default credentials",
				),
			);
			expect(classified.kind).toBe("credentials");
			expect(classified.transient).toBe(false);
		});
	});

	describe("ambiguous strings", () => {
		test("quota wins over credentials when both patterns appear", () => {
			const classified = classifyTranslationError(
				"HTTP 401 Unauthorized - RESOURCE_EXHAUSTED quota exceeded",
			);
			expect(classified.kind).toBe("quota");
		});

		test("timeout wins when the message mentions both timeout and network", () => {
			const classified = classifyTranslationError("network socket timed out");
			expect(classified.kind).toBe("timeout");
		});
	});

	describe("TranslationError cause chains", () => {
		test("wrapper message alone is unexpected; cause determines the class", () => {
			const error = new TranslationError(
				"Translation failed after 3 attempts",
				{
					attempts: 3,
					cause: new Error("quota exceeded"),
				},
			);
			const classified = classifyTranslationError(error);
			expect(classified.kind).toBe("quota");
			expect(classified.transient).toBe(true);
			expect(classified.raw).toBe(
				"Translation failed after 3 attempts: quota exceeded",
			);
		});

		test("ApiError deep in the chain wins over wrapper noise", () => {
			const error = new TranslationError(
				"Translation failed after 3 attempts",
				{
					attempts: 3,
					cause: Object.assign(new Error("Google error"), {
						code: 429,
						message: "RESOURCE_EXHAUSTED",
					}),
				},
			);
			const classified = classifyTranslationError(error);
			expect(classified.kind).toBe("quota");
			expect(classified.raw).toContain("RESOURCE_EXHAUSTED");
		});

		test("credentials cause is permanent", () => {
			const error = new TranslationError(
				"Translation failed after 3 attempts",
				{
					attempts: 3,
					cause: { code: 403, message: "Permission denied" },
				},
			);
			const classified = classifyTranslationError(error);
			expect(classified.kind).toBe("credentials");
			expect(classified.transient).toBe(false);
		});

		test("fully unknown cause is unexpected with raw detail preserved", () => {
			const error = new TranslationError(
				"Translation failed after 3 attempts",
				{
					attempts: 3,
					cause: new Error("weird internal failure"),
				},
			);
			const classified = classifyTranslationError(error);
			expect(classified.kind).toBe("unexpected");
			expect(classified.transient).toBe(false);
			expect(classified.raw).toBe(
				"Translation failed after 3 attempts: weird internal failure",
			);
		});
	});

	describe("unknown errors and exotic shapes", () => {
		test("plain object without message is unexpected", () => {
			const classified = classifyTranslationError({ something: "else" });
			expect(classified.kind).toBe("unexpected");
			expect(classified.transient).toBe(false);
			expect(classified.raw).toBe("Unknown translation error");
		});

		test("null and undefined are unexpected", () => {
			expect(classifyTranslationError(null).kind).toBe("unexpected");
			expect(classifyTranslationError(undefined).kind).toBe("unexpected");
		});

		test("thrown string is classified by its content", () => {
			expect(classifyTranslationError("quota exceeded").kind).toBe("quota");
			expect(classifyTranslationError("ECONNREFUSED").kind).toBe("network");
			expect(classifyTranslationError("mystery failure").kind).toBe(
				"unexpected",
			);
		});

		test("circular cause chain does not loop forever", () => {
			const a: Error & { cause?: unknown } = new Error("a");
			const b: Error & { cause?: unknown } = new Error("b");
			a.cause = b;
			b.cause = a;
			const classified = classifyTranslationError(a);
			expect(classified.kind).toBe("unexpected");
			expect(classified.raw).toBe("a: b");
		});
	});

	describe("actionable messages", () => {
		test("every kind has a distinct non-trivial actionable message", () => {
			const kinds = new Set(
				TRANSLATION_ERROR_KINDS.map((kind) => {
					const classified = classifyTranslationError(
						kind === "quota"
							? { code: 429, message: "quota" }
							: kind === "network"
								? { code: 503, message: "network" }
								: kind === "timeout"
									? { code: 408, message: "timeout" }
									: kind === "credentials"
										? { code: 401, message: "credentials" }
										: "unknown failure",
					);
					expect(classified.kind).toBe(kind);
					expect(classified.message.length).toBeGreaterThan(20);
					return classified.message;
				}),
			);
			expect(kinds.size).toBe(TRANSLATION_ERROR_KINDS.length);
		});
	});
});

describe("formatTranslationError", () => {
	test("composes actionable message with preserved raw detail", () => {
		const error = new TranslationError("Translation failed after 3 attempts", {
			attempts: 3,
			cause: new Error("quota exceeded"),
		});
		const formatted = formatTranslationError(error);
		expect(formatted).toContain("Translation quota exceeded.");
		expect(formatted).toContain(
			"(raw: Translation failed after 3 attempts: quota exceeded)",
		);
		expect(formatted).toMatch(/\(raw: .+\)$/);
	});

	test("preserves raw detail for unknown errors", () => {
		const formatted = formatTranslationError(new Error("API down"));
		expect(formatted).toContain("(raw: API down)");
	});
});

describe("isTransientTranslationError", () => {
	test("true for quota, network, timeout", () => {
		expect(isTransientTranslationError({ code: 429, message: "quota" })).toBe(
			true,
		);
		expect(isTransientTranslationError("ENOTFOUND host")).toBe(true);
		expect(isTransientTranslationError("timed out")).toBe(true);
	});

	test("false for credentials and unexpected", () => {
		expect(isTransientTranslationError({ code: 401, message: "no" })).toBe(
			false,
		);
		expect(isTransientTranslationError("API down")).toBe(false);
	});
});

describe("isRetryable", () => {
	test("quota and credentials are not retried in the tight loop", () => {
		expect(isRetryable("quota")).toBe(false);
		expect(isRetryable("credentials")).toBe(false);
	});

	test("network, timeout and unexpected keep their retries", () => {
		expect(isRetryable("network")).toBe(true);
		expect(isRetryable("timeout")).toBe(true);
		expect(isRetryable("unexpected")).toBe(true);
	});

	test("quota stays transient even though it is not retryable", () => {
		// The delayed automatic re-run is keyed on transience; the tight loop
		// is keyed on retryability. A quota failure must keep both answers.
		expect(isRetryable("quota")).toBe(false);
		expect(isTransientTranslationError({ code: 429, message: "quota" })).toBe(
			true,
		);
	});
});

describe("extractProviderErrorDetails", () => {
	test("reads the HTTP status and Google's errors[0].reason", () => {
		const error = Object.assign(new Error("User Rate Limit Exceeded"), {
			code: 403,
			errors: [
				{
					message: "User Rate Limit Exceeded",
					domain: "usageLimits",
					reason: "userRateLimitExceeded",
				},
			],
		});

		expect(extractProviderErrorDetails(error)).toEqual({
			code: 403,
			reason: "userRateLimitExceeded",
		});
	});

	test("finds the fields on the cause chain", () => {
		const inner = Object.assign(new Error("RESOURCE_EXHAUSTED"), {
			code: 429,
			errors: [{ reason: "rateLimitExceeded" }],
		});
		const wrapper = new TranslationError("Translation failed", {
			attempts: 1,
			cause: inner,
		});

		expect(extractProviderErrorDetails(wrapper)).toEqual({
			code: 429,
			reason: "rateLimitExceeded",
		});
	});

	test("returns nothing for an error without provider fields", () => {
		expect(extractProviderErrorDetails(new Error("API down"))).toEqual({});
		expect(extractProviderErrorDetails("boom")).toEqual({});
		expect(extractProviderErrorDetails(null)).toEqual({});
	});
});
