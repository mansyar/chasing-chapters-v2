/**
 * The pre-locale feed URL.
 *
 * Readers and subscribers still hold `/feed.xml`, so it permanently redirects
 * to the English feed rather than 404ing (`FR-9`). The redirect lives here and
 * only here; the proxy lets this path through untouched.
 */
export function GET() {
	return new Response(null, {
		status: 308,
		headers: {
			Location: "/en/feed.xml",
		},
	});
}
