/**
 * Gemini model (via `@ai-sdk/google`) for polishing replies and summarizing tickets. 2.5 Flash, not
 * a newer Flash: in October 2026 the 3.x Flash models often answered free-tier keys with 503 "high
 * demand", while 2.5 Flash kept working
 */
export const AI_MODEL = 'gemini-2.5-flash';

/** How long to wait for the model before giving up, in milliseconds */
export const AI_TIMEOUT_MS = 30_000;

/**
 * Lighter Gemini model for classifying tickets: picking one of three categories needs less than
 * writing text, and on the free tier each model has its own per-minute quota, so a classification
 * backlog doesn't use up the quota that polishing and summarizing need
 */
export const CLASSIFY_MODEL = 'gemini-3.5-flash-lite';
