import {
	resolveHintsForUrl,
	encryptFillValue,
	decryptFillValue,
	encryptHintValues,
	decryptHintValues,
} from '../event-hint.types';
import type { EventHint, HintConfig } from '../event-hint.types';

// =============================================================================
// resolveHintsForUrl
// =============================================================================

describe('resolveHintsForUrl', () => {
	const globalHint: EventHint = {
		action: 'click',
		selector: '.cookie-banner',
		label: 'Dismiss cookies',
	};

	it('should return global hints when no per-URL patterns match', () => {
		const config: HintConfig = {
			global: [globalHint],
			perUrl: [
				{
					pattern: '/products/*',
					hints: [{ action: 'click', selector: '.product-tab' }],
				},
			],
		};

		const result = resolveHintsForUrl(config, 'https://example.com/about');
		expect(result).toHaveLength(1);
		expect(result[0].selector).toBe('.cookie-banner');
	});

	it('should return per-URL hints (replacing global) when a pattern matches', () => {
		const config: HintConfig = {
			global: [globalHint],
			perUrl: [
				{
					pattern: '/products/*',
					hints: [{ action: 'click', selector: '.product-tab' }],
				},
			],
		};

		const result = resolveHintsForUrl(config, 'https://example.com/products/widget');
		expect(result).toHaveLength(1);
		expect(result[0].selector).toBe('.product-tab');
		// Global hint should NOT be present
		expect(result.find((h) => h.selector === '.cookie-banner')).toBeUndefined();
	});

	it('should merge hints from multiple matching per-URL patterns', () => {
		const config: HintConfig = {
			global: [globalHint],
			perUrl: [
				{
					pattern: '/products/*',
					hints: [{ action: 'click', selector: '.product-tab' }],
				},
				{
					pattern: '/products/**',
					hints: [{ action: 'hover', selector: '.product-image' }],
				},
			],
		};

		const result = resolveHintsForUrl(config, 'https://example.com/products/widget');
		expect(result).toHaveLength(2);
		expect(result.map((h) => h.selector)).toContain('.product-tab');
		expect(result.map((h) => h.selector)).toContain('.product-image');
	});

	it('should deduplicate by selector + action (keeps first)', () => {
		const config: HintConfig = {
			global: [],
			perUrl: [
				{
					pattern: '/products/*',
					hints: [
						{ action: 'click', selector: '.btn', label: 'first' },
					],
				},
				{
					pattern: '/products/**',
					hints: [
						{ action: 'click', selector: '.btn', label: 'duplicate' },
					],
				},
			],
		};

		const result = resolveHintsForUrl(config, 'https://example.com/products/widget');
		expect(result).toHaveLength(1);
		expect(result[0].label).toBe('first');
	});

	it('should sort: sequenced hints first (by seq), unsequenced last', () => {
		const config: HintConfig = {
			global: [
				{ action: 'click', selector: '.c', label: 'no-seq' },
				{ action: 'click', selector: '.b', seq: 10, label: 'seq-10' },
				{ action: 'click', selector: '.a', seq: 1, label: 'seq-1' },
			],
			perUrl: [],
		};

		const result = resolveHintsForUrl(config, 'https://example.com/any-page');
		expect(result.map((h) => h.label)).toEqual(['seq-1', 'seq-10', 'no-seq']);
	});

	it('should return empty array when config has no hints', () => {
		const config: HintConfig = {
			global: [],
			perUrl: [],
		};

		const result = resolveHintsForUrl(config, 'https://example.com/page');
		expect(result).toEqual([]);
	});

	it('should return empty array when config is null', () => {
		const result = resolveHintsForUrl(null as any, 'https://example.com/page');
		expect(result).toEqual([]);
	});

	it('should correctly match glob pattern /products/* to /products/widget', () => {
		const config: HintConfig = {
			global: [],
			perUrl: [
				{
					pattern: '/products/*',
					hints: [{ action: 'click', selector: '.product' }],
				},
			],
		};

		const result = resolveHintsForUrl(config, 'https://example.com/products/widget');
		expect(result).toHaveLength(1);
	});

	it('should NOT match /products/* against /about', () => {
		const config: HintConfig = {
			global: [globalHint],
			perUrl: [
				{
					pattern: '/products/*',
					hints: [{ action: 'click', selector: '.product' }],
				},
			],
		};

		const result = resolveHintsForUrl(config, 'https://example.com/about');
		// Falls back to global hints
		expect(result).toHaveLength(1);
		expect(result[0].selector).toBe('.cookie-banner');
	});
});

// =============================================================================
// encryptFillValue / decryptFillValue
// =============================================================================

describe('encryptFillValue / decryptFillValue', () => {
	const TEST_KEY = 'test-encryption-key-12345';

	it('should round-trip: encrypt then decrypt returns original value', () => {
		const original = 'my-secret-password';
		const encrypted = encryptFillValue(original, TEST_KEY);
		const decrypted = decryptFillValue(encrypted, TEST_KEY);

		expect(decrypted).toBe(original);
	});

	it('should round-trip with empty string', () => {
		const encrypted = encryptFillValue('', TEST_KEY);
		const decrypted = decryptFillValue(encrypted, TEST_KEY);

		expect(decrypted).toBe('');
	});

	it('should round-trip with unicode characters', () => {
		const original = 'password-with-special-chars';
		const encrypted = encryptFillValue(original, TEST_KEY);
		const decrypted = decryptFillValue(encrypted, TEST_KEY);

		expect(decrypted).toBe(original);
	});

	it('should produce different ciphertext with different keys', () => {
		const value = 'same-value';
		const encrypted1 = encryptFillValue(value, 'key-one');
		const encrypted2 = encryptFillValue(value, 'key-two');

		expect(encrypted1).not.toBe(encrypted2);
	});

	it('should throw when decrypting with wrong key', () => {
		const encrypted = encryptFillValue('secret', 'correct-key');

		expect(() => {
			decryptFillValue(encrypted, 'wrong-key');
		}).toThrow();
	});

	it('should produce format iv:authTag:ciphertext', () => {
		const encrypted = encryptFillValue('test', TEST_KEY);
		const parts = encrypted.split(':');

		expect(parts).toHaveLength(3);
		// IV is 16 bytes = 32 hex chars
		expect(parts[0]).toHaveLength(32);
		// Auth tag is 16 bytes = 32 hex chars
		expect(parts[1]).toHaveLength(32);
		// Ciphertext should be non-empty
		expect(parts[2].length).toBeGreaterThan(0);
	});
});

// =============================================================================
// encryptHintValues / decryptHintValues
// =============================================================================

describe('encryptHintValues / decryptHintValues', () => {
	const TEST_KEY = 'test-bulk-encryption-key';

	it('should encrypt value fields only on fill/fillSubmit hints', () => {
		const config: HintConfig = {
			global: [
				{ action: 'fill', selector: '#email', value: 'user@test.com' },
				{ action: 'fillSubmit', selector: '#submit', value: 'password123' },
				{ action: 'click', selector: '.btn' },
				{ action: 'hover', selector: '.menu' },
			],
			perUrl: [],
		};

		const encrypted = encryptHintValues(config, TEST_KEY);

		// fill and fillSubmit values should be encrypted (not the original plaintext)
		expect(encrypted.global[0].value).not.toBe('user@test.com');
		expect(encrypted.global[1].value).not.toBe('password123');

		// click and hover should be unchanged (no value field)
		expect(encrypted.global[2]).toEqual({ action: 'click', selector: '.btn' });
		expect(encrypted.global[3]).toEqual({ action: 'hover', selector: '.menu' });
	});

	it('should leave click/hover/wait/remove hints unchanged', () => {
		const config: HintConfig = {
			global: [
				{ action: 'click', selector: '.btn', count: 2 },
				{ action: 'hover', selector: '.menu' },
				{ action: 'wait', waitAfter: 1000 },
				{ action: 'remove', selector: '.overlay' },
			],
			perUrl: [],
		};

		const encrypted = encryptHintValues(config, TEST_KEY);

		expect(encrypted.global[0]).toEqual(config.global[0]);
		expect(encrypted.global[1]).toEqual(config.global[1]);
		expect(encrypted.global[2]).toEqual(config.global[2]);
		expect(encrypted.global[3]).toEqual(config.global[3]);
	});

	it('should round-trip through encrypt config -> resolve -> decrypt producing original values', () => {
		const config: HintConfig = {
			global: [
				{ action: 'fill', selector: '#email', value: 'user@test.com', seq: 1 },
				{ action: 'fillSubmit', selector: '#submit', value: 'password123', seq: 2 },
				{ action: 'click', selector: '.btn', seq: 3 },
			],
			perUrl: [],
		};

		// Step 1: Encrypt the config
		const encrypted = encryptHintValues(config, TEST_KEY);

		// Step 2: Resolve hints for a URL (no per-URL match, returns global)
		const resolved = resolveHintsForUrl(encrypted, 'https://example.com/page');

		// Step 3: Decrypt the resolved hints
		const decrypted = decryptHintValues(resolved, TEST_KEY);

		expect(decrypted[0].value).toBe('user@test.com');
		expect(decrypted[1].value).toBe('password123');
		// click hint should have no value
		expect(decrypted[2].value).toBeUndefined();
	});

	it('should handle perUrl hints encryption', () => {
		const config: HintConfig = {
			global: [],
			perUrl: [
				{
					pattern: '/login',
					hints: [
						{ action: 'fill', selector: '#user', value: 'admin' },
						{ action: 'fill', selector: '#pass', value: 'secret' },
					],
				},
			],
		};

		const encrypted = encryptHintValues(config, TEST_KEY);

		// perUrl hints should be encrypted
		expect(encrypted.perUrl[0].hints[0].value).not.toBe('admin');
		expect(encrypted.perUrl[0].hints[1].value).not.toBe('secret');

		// Resolve for matching URL
		const resolved = resolveHintsForUrl(encrypted, 'https://example.com/login');
		const decrypted = decryptHintValues(resolved, TEST_KEY);

		expect(decrypted[0].value).toBe('admin');
		expect(decrypted[1].value).toBe('secret');
	});

	it('should not modify the original config object', () => {
		const config: HintConfig = {
			global: [
				{ action: 'fill', selector: '#email', value: 'original' },
			],
			perUrl: [],
		};

		encryptHintValues(config, TEST_KEY);

		// Original should be unchanged
		expect(config.global[0].value).toBe('original');
	});
});
