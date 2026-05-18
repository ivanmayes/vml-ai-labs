export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPT_MIMES = 'image/png,image/jpeg,image/webp,image/gif';

export function nextId(): string {
	if (
		typeof crypto !== 'undefined' &&
		typeof crypto.randomUUID === 'function'
	) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createImagePreviewUrl(file: File): string {
	return URL.createObjectURL(file);
}

export function revokeImagePreviewUrl(url: string): void {
	try {
		URL.revokeObjectURL(url);
	} catch {
		// Some environments (jsdom, older browsers) throw — safe to ignore.
	}
}

interface MaybeHttpErrorResponse {
	status?: number;
	error?: { message?: string };
	message?: string;
}

export function extractErrorMessage(
	err: unknown,
	options: { override404?: string; fallback?: string } = {},
): string {
	const e = err as MaybeHttpErrorResponse | null | undefined;
	if (e?.status === 404 && options.override404) return options.override404;
	if (e?.error?.message) return e.error.message;
	if (e?.message) return e.message;
	return options.fallback ?? 'Something went wrong.';
}
