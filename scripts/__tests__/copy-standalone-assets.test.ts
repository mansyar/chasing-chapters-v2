import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyStandaloneAssets } from "../copy-standalone-assets";

describe("copyStandaloneAssets", () => {
	let root: string;

	afterEach(() => {
		if (root) rmSync(root, { recursive: true, force: true });
	});

	test("copies .next/static and public into the standalone output", () => {
		root = mkdtempSync(join(tmpdir(), "standalone-test-"));
		mkdirSync(join(root, ".next", "static", "chunks"), { recursive: true });
		mkdirSync(join(root, ".next", "standalone"), { recursive: true });
		mkdirSync(join(root, "public"), { recursive: true });
		writeFileSync(join(root, ".next", "standalone", "server.js"), "server");
		writeFileSync(join(root, ".next", "static", "chunks", "app.js"), "js");
		writeFileSync(join(root, "public", "og-image.jpg"), "img");

		const result = copyStandaloneAssets(root);

		expect(result.copied).toHaveLength(2);
		expect(result.skipped).toHaveLength(0);
		expect(
			existsSync(
				join(
					root,
					".next",
					"standalone",
					".next",
					"static",
					"chunks",
					"app.js",
				),
			),
		).toBe(true);
		expect(
			existsSync(join(root, ".next", "standalone", "public", "og-image.jpg")),
		).toBe(true);
	});

	test("throws with a helpful message when no standalone build exists", () => {
		root = mkdtempSync(join(tmpdir(), "standalone-test-"));

		expect(() => copyStandaloneAssets(root)).toThrow(/bun run build/);
	});

	test("skips sources that do not exist", () => {
		root = mkdtempSync(join(tmpdir(), "standalone-test-"));
		mkdirSync(join(root, ".next", "static"), { recursive: true });
		mkdirSync(join(root, ".next", "standalone"), { recursive: true });
		writeFileSync(join(root, ".next", "standalone", "server.js"), "server");

		const result = copyStandaloneAssets(root);

		expect(result.copied).toHaveLength(1);
		expect(result.skipped).toHaveLength(1);
	});
});
