/**
 * Maps Payload media proxy paths to the public R2 domain.
 *
 * The storage-s3 plugin writes objects to R2 but its generateURL emits the
 * private S3 API endpoint, and every page consumes `coverImage.url` — a
 * root-relative `/api/media/file/<filename>` proxy path. Each such request
 * re-enters the Next server, streams the object from R2 through Payload, and
 * only then reaches the image optimizer (a 1.2-2.5s cold path). Serving the
 * public custom domain cuts the app out of the image path entirely.
 *
 * `NEXT_PUBLIC_R2_PUBLIC_URL` must be set at build time (NEXT_PUBLIC_* values
 * are inlined by Next); unset, the proxy path is passed through so local dev
 * keeps working without the public bucket.
 */
export function resolveMediaUrl(url: string, publicUrl?: string): string;
export function resolveMediaUrl(
	url: string | null | undefined,
	publicUrl?: string,
): string | null | undefined;
export function resolveMediaUrl(
	url: string | null | undefined,
	publicUrl: string | undefined = process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
): string | null | undefined {
	if (!url || !publicUrl) {
		return url;
	}

	if (url.startsWith("/api/media/file/")) {
		// The path segment is already URL-encoded by Payload; encoding it again
		// produces %2520 (double-encoded) and 404s against the bucket.
		const filename = url.replace("/api/media/file/", "");
		return `${publicUrl}/${filename}`;
	}

	// Already absolute (external) or an unrelated relative path — leave as-is.
	return url;
}
