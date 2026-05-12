export interface ShareImageInput {
	signedUrl: string;
	filename: string;
	mime: string;
}

export type ShareResult =
	| { kind: 'shared' }
	| { kind: 'cancelled' }
	| { kind: 'fallback'; mailto: string; sms: string | null; url: string }
	| { kind: 'error' };

/**
 * Try the OS share sheet (Web Share API with a File payload). When that
 * is not available — desktop browsers, or iOS where canShare returns
 * false for files — return a fallback payload the caller renders as
 * mailto / sms / copy-link buttons.
 */
export async function shareImage(input: ShareImageInput): Promise<ShareResult> {
	const fallback = makeFallback(input);

	if (typeof navigator === 'undefined' || !navigator.share) {
		return fallback;
	}

	try {
		const response = await fetch(input.signedUrl, { mode: 'cors' });
		if (!response.ok) return fallback;
		const blob = await response.blob();
		const file = new File([blob], input.filename, { type: input.mime });

		const canShare =
			typeof navigator.canShare === 'function'
				? navigator.canShare({ files: [file] })
				: false;
		if (!canShare) {
			return fallback;
		}

		await navigator.share({
			files: [file],
			title: input.filename,
		});
		return { kind: 'shared' };
	} catch (err) {
		if ((err as DOMException)?.name === 'AbortError') {
			return { kind: 'cancelled' };
		}
		return fallback;
	}
}

function makeFallback(input: ShareImageInput): {
	kind: 'fallback';
	mailto: string;
	sms: string | null;
	url: string;
} {
	const subject = encodeURIComponent(input.filename);
	const body = encodeURIComponent(input.signedUrl);
	const isMobile =
		typeof navigator !== 'undefined' &&
		/Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);
	return {
		kind: 'fallback',
		mailto: `mailto:?subject=${subject}&body=${body}`,
		sms: isMobile ? `sms:?body=${body}` : null,
		url: input.signedUrl,
	};
}
