// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
	dsn: "https://072f1bb4566d890d9eb5879991d4b26c@o4510476559515648.ingest.de.sentry.io/4510476563251280",

	// Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
	tracesSampleRate: 0.1, // 10% of transactions for performance monitoring

	// Only enable in production
	enabled: process.env.NODE_ENV === "production",
});
