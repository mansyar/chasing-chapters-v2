"use client";

import { useDocumentInfo, useField } from "@payloadcms/ui";
import React from "react";
import {
	publishScheduleNotice,
	type ReviewPublishDoc,
	reviewPublishState,
} from "./publish-state";

/**
 * The edit-view sentence about when a review publishes (`FR-7`, `AC-7`).
 *
 * It hangs off a `ui` field placed directly after `publishAt` in the sidebar,
 * so the sentence sits where the author sets the schedule. It takes no props:
 * it reads the document, the way the re-translate button already does.
 *
 * `publishAt` is read through `useField` rather than from the document, because
 * `useDocumentInfo().data` is the last *saved* document - a notice built from
 * it would keep saying "Live" while the author is picking a future date. The
 * saved document is still the fallback for the first render, before the form
 * state is initialized.
 */
export const PublishScheduleNotice: React.FC = () => {
	const { data } = useDocumentInfo();
	const { value: scheduledValue } = useField<string | null>({
		path: "publishAt",
	});

	const doc: ReviewPublishDoc = {
		_status: data?._status,
		// The form's `null` is a value: the author cleared the schedule, so the
		// notice must stop promising a publication that is no longer set. Only
		// `undefined` means the form has not been initialized yet, and that is
		// when the saved document is the right answer.
		publishAt: scheduledValue === undefined ? data?.publishAt : scheduledValue,
	};
	const notice = publishScheduleNotice(doc, new Date());

	if (notice === null) {
		return null;
	}

	return (
		<p
			data-publish-state={reviewPublishState(doc, new Date())}
			style={{
				color: "var(--theme-elevation-600)",
				fontSize: "0.85rem",
				lineHeight: 1.4,
				margin: "0 0 12px",
			}}
		>
			{notice}
		</p>
	);
};
