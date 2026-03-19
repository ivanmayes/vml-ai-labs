import type { CallbackPayload, LambdaEnvConfig } from './types';

// ---------------------------------------------------------------------------
// Callback to Heroku — Bearer token auth, retry on 5xx
// ---------------------------------------------------------------------------

/** Maximum number of retries on 5xx errors */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms) */
const BASE_DELAY_MS = 500;

/**
 * Send page result + discovered links to the Heroku callback endpoint.
 * Uses Bearer token auth (shared secret from CALLBACK_SECRET env var).
 *
 * Handles special HTTP status codes:
 * - 410 Gone: Job is cancelled — returns without error (stop processing)
 * - 409 Conflict: Page already exists — returns without error (idempotent)
 * - 5xx: Retries up to MAX_RETRIES times with exponential backoff
 *
 * @param payload - The page result and discovered links
 * @param config - Lambda environment config (callbackUrl, callbackSecret)
 * @throws On non-retryable errors or after exhausting retries
 */
export async function sendCallback(
	payload: CallbackPayload,
	config: LambdaEnvConfig,
): Promise<void> {
	const url = `${config.callbackUrl}/internal/scraper/page-result`;
	const body = JSON.stringify(payload);

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		if (attempt > 0) {
			// Exponential backoff: 500ms, 1000ms
			const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${config.callbackSecret}`,
				},
				body,
				signal: AbortSignal.timeout(30_000), // 30s timeout
			});

			// 2xx — success
			if (response.ok) {
				return;
			}

			// 410 Gone — job is cancelled, stop without error
			if (response.status === 410) {
				console.log(
					`Job ${payload.jobId} is cancelled (410 Gone) — skipping`,
				);
				return;
			}

			// 409 Conflict — page already exists, idempotent success
			if (response.status === 409) {
				console.log(
					`Page already exists for job ${payload.jobId} (409 Conflict) — skipping`,
				);
				return;
			}

			// 5xx — retry
			if (response.status >= 500 && attempt < MAX_RETRIES) {
				console.warn(
					`Callback returned ${response.status}, retrying (attempt ${attempt + 1}/${MAX_RETRIES})`,
				);
				continue;
			}

			// Non-retryable error
			const responseBody = await response.text().catch(() => '');
			throw new Error(
				`Callback failed with status ${response.status}: ${responseBody}`,
			);
		} catch (error) {
			// Network errors — retry if possible
			if (
				attempt < MAX_RETRIES &&
				error instanceof TypeError &&
				error.message.includes('fetch')
			) {
				console.warn(
					`Callback network error, retrying (attempt ${attempt + 1}/${MAX_RETRIES}): ${error.message}`,
				);
				continue;
			}

			// Re-throw if we've exhausted retries or it's not a network error
			if (attempt >= MAX_RETRIES || !(error instanceof TypeError)) {
				throw error;
			}
		}
	}
}

/**
 * Send a failure callback to Heroku.
 * This is a best-effort notification — errors are logged but not thrown.
 *
 * @param payload - The failure payload
 * @param config - Lambda environment config
 */
export async function sendFailureCallback(
	payload: CallbackPayload,
	config: LambdaEnvConfig,
): Promise<void> {
	try {
		await sendCallback(payload, config);
	} catch (error) {
		console.error(`Failed to send failure callback: ${error}`);
		// Don't re-throw — this is best-effort
	}
}

/**
 * Check if a job has been cancelled by making a HEAD request to the callback URL.
 *
 * @param jobId - The job ID to check
 * @param config - Lambda environment config
 * @returns true if the job is cancelled
 */
export async function isJobCancelled(
	jobId: string,
	config: LambdaEnvConfig,
): Promise<boolean> {
	try {
		const response = await fetch(
			`${config.callbackUrl}/internal/scraper/job-status/${jobId}`,
			{
				method: 'HEAD',
				headers: {
					Authorization: `Bearer ${config.callbackSecret}`,
				},
				signal: AbortSignal.timeout(5_000), // 5s timeout
			},
		);

		// 410 Gone means the job is cancelled
		return response.status === 410;
	} catch {
		// If we can't reach Heroku, assume the job is still active
		// The callback will catch cancellation later
		return false;
	}
}
