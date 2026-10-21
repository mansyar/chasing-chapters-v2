import { describe, expect, it } from "bun:test";
import {
	CI_WORKER_COUNT,
	DEFAULT_E2E_PORT,
	DEFAULT_WORKER_COUNT,
	resolveE2EBaseURL,
	resolveE2EPort,
	resolveWorkerCount,
} from "../e2e-harness";

describe("e2e-harness", () => {
	describe("resolveWorkerCount", () => {
		it("defaults to three workers on a developer machine", () => {
			expect(resolveWorkerCount({})).toBe(3);
			expect(resolveWorkerCount({})).toBe(DEFAULT_WORKER_COUNT);
		});

		it("runs with a single worker in CI", () => {
			expect(resolveWorkerCount({ CI: "true" })).toBe(1);
			expect(resolveWorkerCount({ CI: "1" })).toBe(CI_WORKER_COUNT);
		});

		it("honours the PLAYWRIGHT_WORKERS override", () => {
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "5" })).toBe(5);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "1" })).toBe(1);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: " 8 " })).toBe(8);
		});

		it("keeps the CI single-worker cap even when an override is set", () => {
			expect(resolveWorkerCount({ CI: "true", PLAYWRIGHT_WORKERS: "5" })).toBe(
				CI_WORKER_COUNT,
			);
		});

		it("falls back to the default for a malformed override", () => {
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "many" })).toBe(
				DEFAULT_WORKER_COUNT,
			);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "0" })).toBe(
				DEFAULT_WORKER_COUNT,
			);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "-2" })).toBe(
				DEFAULT_WORKER_COUNT,
			);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "2.5" })).toBe(
				DEFAULT_WORKER_COUNT,
			);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "" })).toBe(
				DEFAULT_WORKER_COUNT,
			);
		});

		it("treats an explicitly disabled CI as a developer machine", () => {
			expect(resolveWorkerCount({ CI: "false" })).toBe(DEFAULT_WORKER_COUNT);
			expect(resolveWorkerCount({ CI: "0" })).toBe(DEFAULT_WORKER_COUNT);
			expect(resolveWorkerCount({ CI: "false", PLAYWRIGHT_WORKERS: "5" })).toBe(
				5,
			);
		});
	});

	describe("resolveE2EPort", () => {
		it("defaults to the dedicated e2e port", () => {
			expect(resolveE2EPort({})).toBe(3100);
			expect(resolveE2EPort({})).toBe(DEFAULT_E2E_PORT);
		});

		it("honours the E2E_PORT override", () => {
			expect(resolveE2EPort({ E2E_PORT: "3200" })).toBe(3200);
		});

		it("falls back to the default for a malformed or out-of-range value", () => {
			expect(resolveE2EPort({ E2E_PORT: "abc" })).toBe(DEFAULT_E2E_PORT);
			expect(resolveE2EPort({ E2E_PORT: "0" })).toBe(DEFAULT_E2E_PORT);
			expect(resolveE2EPort({ E2E_PORT: "70000" })).toBe(DEFAULT_E2E_PORT);
			expect(resolveE2EPort({ E2E_PORT: "" })).toBe(DEFAULT_E2E_PORT);
		});
	});

	describe("resolveE2EBaseURL", () => {
		it("matches the resolved port", () => {
			expect(resolveE2EBaseURL({})).toBe("http://localhost:3100");
			expect(resolveE2EBaseURL({ E2E_PORT: "3200" })).toBe(
				"http://localhost:3200",
			);
		});
	});
});
