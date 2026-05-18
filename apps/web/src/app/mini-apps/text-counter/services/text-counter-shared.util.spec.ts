import {
	extractErrorMessage,
	nextId,
	revokeImagePreviewUrl,
} from './text-counter-shared.util';

describe('text-counter-shared.util', () => {
	describe('nextId', () => {
		it('returns unique strings on successive calls', () => {
			const ids = new Set<string>();
			for (let i = 0; i < 50; i++) {
				ids.add(nextId());
			}
			expect(ids.size).toBe(50);
		});

		it('returns a non-empty string', () => {
			const id = nextId();
			expect(typeof id).toBe('string');
			expect(id.length).toBeGreaterThan(0);
		});
	});

	describe('extractErrorMessage', () => {
		it('returns the 404 override when status is 404 and override is provided', () => {
			const msg = extractErrorMessage(
				{ status: 404, error: { message: 'gone' } },
				{ override404: 'Template missing.' },
			);
			expect(msg).toBe('Template missing.');
		});

		it('falls through to nested error.message when status is 404 but no override is provided', () => {
			const msg = extractErrorMessage({
				status: 404,
				error: { message: 'gone' },
			});
			expect(msg).toBe('gone');
		});

		it('returns nested error.message when present', () => {
			const msg = extractErrorMessage({
				error: { message: 'nested explanation' },
			});
			expect(msg).toBe('nested explanation');
		});

		it('returns top-level message when nested error.message is absent', () => {
			const msg = extractErrorMessage({ message: 'top-level boom' });
			expect(msg).toBe('top-level boom');
		});

		it('returns the fallback when no message is available', () => {
			const msg = extractErrorMessage(null, { fallback: 'oh no' });
			expect(msg).toBe('oh no');
		});

		it('returns the default fallback when no fallback option is provided', () => {
			expect(extractErrorMessage(undefined)).toBe(
				'Something went wrong.',
			);
			expect(extractErrorMessage({})).toBe('Something went wrong.');
		});

		it('prefers nested error.message over top-level message', () => {
			const msg = extractErrorMessage({
				error: { message: 'nested' },
				message: 'top',
			});
			expect(msg).toBe('nested');
		});
	});

	describe('revokeImagePreviewUrl', () => {
		it('calls URL.revokeObjectURL with the given url', () => {
			const spy = spyOn(URL, 'revokeObjectURL').and.callFake(
				() => undefined,
			);
			revokeImagePreviewUrl('blob:abc');
			expect(spy).toHaveBeenCalledWith('blob:abc');
		});

		it('swallows errors thrown by URL.revokeObjectURL', () => {
			spyOn(URL, 'revokeObjectURL').and.callFake(() => {
				throw new Error('jsdom does not support revokeObjectURL');
			});
			expect(() => revokeImagePreviewUrl('blob:abc')).not.toThrow();
		});
	});
});
