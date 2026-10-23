/**
 * The public route group.
 *
 * It renders no markup of its own: the document shell lives one level down in
 * `[locale]/layout.tsx`, where it can read the locale segment for `<html lang>`
 * and the feed/canonical metadata. The group stays here so the tree says what
 * belongs to the public site, and children pass straight through.
 */
export default function PublicGroupLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return children;
}
