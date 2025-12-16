// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://072f1bb4566d890d9eb5879991d4b26c@o4510476559515648.ingest.de.sentry.io/4510476563251280",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1, // 10% of transactions for performance monitoring

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // Lower in production to reduce storage costs
  replaysSessionSampleRate: 0.01, // 1% of sessions

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0, // 100% when error occurs

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
