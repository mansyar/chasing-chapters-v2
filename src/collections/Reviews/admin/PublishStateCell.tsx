"use client";

import type { DefaultCellComponentProps } from "payload";
import React from "react";
import {
	REVIEW_PUBLISH_STATE_LABELS,
	reviewPublishState,
	scheduledMoment,
} from "./publish-state";

/**
 * The reviews list cell for `publishAt` (`FR-7`, `AC-7`).
 *
 * The stored date alone cannot answer the question an author actually asks of
 * a list - "is this one out yet?" - because an empty schedule means "live" and
 * the same column has to distinguish that from a scheduled date and from a
 * draft that is not published at all. So the cell renders the state word and
 * keeps the date on the element's tooltip, where it is available without
 * widening the column.
 *
 * Payload hands a custom cell the whole row as `rowData`, which is what makes
 * `_status` readable next to `publishAt`.
 */
export const PublishStateCell: React.FC<DefaultCellComponentProps> = ({
	rowData,
}) => {
	const state = reviewPublishState(rowData, new Date());
	const moment = scheduledMoment(rowData);

	return (
		<span
			style={STATE_STYLES[state]}
			title={moment === null ? undefined : moment.toISOString()}
		>
			{REVIEW_PUBLISH_STATE_LABELS[state]}
		</span>
	);
};

/**
 * One look per state. The colours are the admin theme's own variables, so the
 * cell follows light and dark mode like the rest of the panel.
 */
const STATE_STYLES: Record<
	"draft" | "live" | "scheduled",
	React.CSSProperties
> = {
	draft: {
		color: "var(--theme-elevation-400)",
	},
	live: {
		color: "var(--theme-success-500)",
	},
	scheduled: {
		color: "var(--theme-warning-500)",
		fontWeight: 600,
	},
};
