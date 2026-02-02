import { Crypt } from './crypt';

describe('Crypt', () => {
	describe('get random number', () => {
		it('should be between 0 and 1', async () => {
			expect(Crypt.random()).toBeWithinRangeExclusive(0, 1);
		});
	});

	describe('encryption', () => {
		it('should create a valid SHA256 hash', () => {
			expect(
				Crypt.createSHA256Hash(
					'A_T0tally_Fake_Signing_K#y',
					'SomeUser@email.com',
				),
			).toBe('Cp9i0g9HzUwZ/gtZg9/tOtDa9FS2TCPtlm77sEAzZs0=');
		});

		it('should be encrypted', () => {
			const testData = `This is only a test. No cause for alarm.`;
			const signingKey = 'Cp9i0g9HzUwZ/gtZg9/tOtDa9FS2TCPtlm77sEAzZs0=';
			const iv = 'd52c4b9782c65864';

			expect(Crypt.encrypt(testData, signingKey, iv)).toBe(
				'wsIyLLkq1bb6pQ99BweMnpwcWeeNzluaaPbTTVEBvhv6RnTVXUAgZNUtd9+fIFSm',
			);
		});

		it('should be decrypted', () => {
			const testData = `wsIyLLkq1bb6pQ99BweMnpwcWeeNzluaaPbTTVEBvhv6RnTVXUAgZNUtd9+fIFSm`;
			const signingKey = 'Cp9i0g9HzUwZ/gtZg9/tOtDa9FS2TCPtlm77sEAzZs0=';
			const iv = 'd52c4b9782c65864';

			expect(Crypt.decrypt(testData, signingKey, iv)).toBe(
				'This is only a test. No cause for alarm.',
			);
		});

		it('should not be decrypted', () => {
			const testData = `wsIyLLkq1bb6pQ99BweMnpwcWeeNzluaaPbTTVEBvhv6RnTVXUAgZNUtd9+fIFSm`;
			const signingKey = 'Cp9i0g9HzUwZ/gtZg9/tOtDa9FS2TCPtlm77sEAzZs0=';
			const iv = 'd52c4b9782c65865';

			expect(Crypt.decrypt(testData, signingKey, iv)).not.toBe(
				'This is only a test. No cause for alarm.',
			);
		});
	});
});

expect.extend({
	toBeWithinRange(received, floor, ceiling) {
		const pass = received >= floor && received <= ceiling;
		if (pass) {
			return {
				message: () =>
					`expected ${received} not to be within range ${floor} - ${ceiling}`,
				pass: true,
			};
		} else {
			return {
				message: () =>
					`expected ${received} to be within range ${floor} - ${ceiling}`,
				pass: false,
			};
		}
	},
	toBeWithinRangeExclusive(received, floor, ceiling) {
		const pass = received > floor && received < ceiling;
		if (pass) {
			return {
				message: () =>
					`expected ${received} not to be within range ${floor} - ${ceiling}`,
				pass: true,
			};
		} else {
			return {
				message: () =>
					`expected ${received} to be within range ${floor} - ${ceiling}`,
				pass: false,
			};
		}
	},
});

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace -- Jest type augmentation requires namespace
	namespace jest {
		interface Matchers<R> {
			toBeWithinRange(a: number, b: number): R;
			toBeWithinRangeExclusive(a: number, b: number): R;
		}
	}
}
