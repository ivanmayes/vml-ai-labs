/**
 * Fetch an image via signed URL and place it on the OS clipboard as
 * `image/png` so it can be pasted into Claude / ChatGPT / Gemini.
 *
 * Re-encodes to PNG via canvas regardless of source format for the most
 * consistent ingestion across AI chat surfaces.
 *
 * Returns `true` on success. If the Clipboard API is unavailable or the
 * write is rejected (cross-origin iframe without `clipboard-write`, older
 * Safari, permission denied), returns `false` and the caller should fall
 * back to copying the link instead.
 */
export async function copyImageToClipboard(
	signedUrl: string,
): Promise<boolean> {
	if (typeof navigator === 'undefined' || !navigator.clipboard) {
		return false;
	}
	const ClipboardItemCtor: typeof ClipboardItem | undefined = (
		globalThis as unknown as { ClipboardItem?: typeof ClipboardItem }
	).ClipboardItem;
	if (!ClipboardItemCtor) {
		return false;
	}

	try {
		const response = await fetch(signedUrl, { mode: 'cors' });
		if (!response.ok) return false;
		const sourceBlob = await response.blob();

		const pngBlob = await reencodeToPng(sourceBlob);
		if (!pngBlob) return false;

		await navigator.clipboard.write([
			new ClipboardItemCtor({ 'image/png': pngBlob }),
		]);
		return true;
	} catch {
		return false;
	}
}

async function reencodeToPng(blob: Blob): Promise<Blob | null> {
	const objectUrl = URL.createObjectURL(blob);
	try {
		const img = await loadImage(objectUrl);
		const canvas = document.createElement('canvas');
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(img, 0, 0);
		return await new Promise<Blob | null>((resolve) =>
			canvas.toBlob((b) => resolve(b), 'image/png'),
		);
	} catch {
		return null;
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('image load failed'));
		img.src = src;
	});
}
