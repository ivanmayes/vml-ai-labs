import { isPrivateIP, resolvesToPrivateIP } from '../ssrf-protection';

// Mock dns/promises lookup
jest.mock('dns/promises', () => ({
	lookup: jest.fn(),
}));

import { lookup } from 'dns/promises';

const mockedLookup = lookup as jest.MockedFunction<typeof lookup>;

// =============================================================================
// isPrivateIP — synchronous IP classification
// =============================================================================

describe('isPrivateIP', () => {
	// -- IPv4 private ranges --

	describe('IPv4 private ranges', () => {
		it('should block 127.0.0.1 (loopback)', () => {
			expect(isPrivateIP('127.0.0.1')).toBe(true);
		});

		it('should block 127.255.255.255 (loopback range)', () => {
			expect(isPrivateIP('127.255.255.255')).toBe(true);
		});

		it('should block 10.0.0.1 (class A private)', () => {
			expect(isPrivateIP('10.0.0.1')).toBe(true);
		});

		it('should block 10.255.255.255 (class A private end)', () => {
			expect(isPrivateIP('10.255.255.255')).toBe(true);
		});

		it('should block 172.16.0.1 (class B private start)', () => {
			expect(isPrivateIP('172.16.0.1')).toBe(true);
		});

		it('should block 172.31.255.255 (class B private end)', () => {
			expect(isPrivateIP('172.31.255.255')).toBe(true);
		});

		it('should NOT block 172.15.0.1 (below class B private)', () => {
			expect(isPrivateIP('172.15.0.1')).toBe(false);
		});

		it('should NOT block 172.32.0.1 (above class B private)', () => {
			expect(isPrivateIP('172.32.0.1')).toBe(false);
		});

		it('should block 192.168.0.1 (class C private)', () => {
			expect(isPrivateIP('192.168.0.1')).toBe(true);
		});

		it('should block 192.168.255.255 (class C private end)', () => {
			expect(isPrivateIP('192.168.255.255')).toBe(true);
		});

		it('should block 169.254.169.254 (link-local / AWS metadata)', () => {
			expect(isPrivateIP('169.254.169.254')).toBe(true);
		});

		it('should block 169.254.0.1 (link-local start)', () => {
			expect(isPrivateIP('169.254.0.1')).toBe(true);
		});

		it('should block 0.0.0.0 (unspecified)', () => {
			expect(isPrivateIP('0.0.0.0')).toBe(true);
		});
	});

	// -- IPv4 public addresses --

	describe('IPv4 public addresses', () => {
		it('should allow 8.8.8.8 (Google DNS)', () => {
			expect(isPrivateIP('8.8.8.8')).toBe(false);
		});

		it('should allow 1.1.1.1 (Cloudflare DNS)', () => {
			expect(isPrivateIP('1.1.1.1')).toBe(false);
		});

		it('should allow 93.184.216.34 (example.com)', () => {
			expect(isPrivateIP('93.184.216.34')).toBe(false);
		});

		it('should allow 192.169.0.1 (NOT 192.168.x.x)', () => {
			expect(isPrivateIP('192.169.0.1')).toBe(false);
		});

		it('should allow 11.0.0.1 (NOT 10.x.x.x)', () => {
			expect(isPrivateIP('11.0.0.1')).toBe(false);
		});

		it('should allow 128.0.0.1 (NOT 127.x.x.x)', () => {
			expect(isPrivateIP('128.0.0.1')).toBe(false);
		});
	});

	// -- IPv6 loopback and private ranges --

	describe('IPv6 private ranges', () => {
		it('should block ::1 (loopback)', () => {
			expect(isPrivateIP('::1')).toBe(true);
		});

		it('should block fc00:: (unique local address)', () => {
			expect(isPrivateIP('fc00::1')).toBe(true);
		});

		it('should block fd12:3456::1 (unique local address)', () => {
			expect(isPrivateIP('fd12:3456::1')).toBe(true);
		});

		it('should block fe80::1 (link-local)', () => {
			expect(isPrivateIP('fe80::1')).toBe(true);
		});
	});

	// -- IPv4-mapped IPv6 addresses --

	describe('IPv4-mapped IPv6 addresses', () => {
		it('should block ::ffff:127.0.0.1 (mapped loopback)', () => {
			expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true);
		});

		it('should block ::ffff:10.0.0.1 (mapped class A)', () => {
			expect(isPrivateIP('::ffff:10.0.0.1')).toBe(true);
		});

		it('should block ::ffff:172.16.0.1 (mapped class B)', () => {
			expect(isPrivateIP('::ffff:172.16.0.1')).toBe(true);
		});

		it('should block ::ffff:192.168.1.1 (mapped class C)', () => {
			expect(isPrivateIP('::ffff:192.168.1.1')).toBe(true);
		});

		it('should block ::ffff:169.254.169.254 (mapped link-local)', () => {
			expect(isPrivateIP('::ffff:169.254.169.254')).toBe(true);
		});

		it('should block ::ffff:0.0.0.0 (mapped unspecified)', () => {
			expect(isPrivateIP('::ffff:0.0.0.0')).toBe(true);
		});
	});
});

// =============================================================================
// resolvesToPrivateIP — async hostname resolution check
// =============================================================================

describe('resolvesToPrivateIP', () => {
	afterEach(() => {
		jest.resetAllMocks();
	});

	it('should check IP addresses directly without DNS lookup', async () => {
		const result = await resolvesToPrivateIP('127.0.0.1');
		expect(result).toBe(true);
		expect(mockedLookup).not.toHaveBeenCalled();
	});

	it('should allow public IP addresses directly', async () => {
		const result = await resolvesToPrivateIP('8.8.8.8');
		expect(result).toBe(false);
		expect(mockedLookup).not.toHaveBeenCalled();
	});

	it('should resolve hostnames via DNS and block private results', async () => {
		mockedLookup.mockResolvedValue({ address: '192.168.1.1', family: 4 });

		const result = await resolvesToPrivateIP('internal.corp');
		expect(result).toBe(true);
		expect(mockedLookup).toHaveBeenCalledWith('internal.corp');
	});

	it('should resolve hostnames and allow public results', async () => {
		mockedLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });

		const result = await resolvesToPrivateIP('example.com');
		expect(result).toBe(false);
		expect(mockedLookup).toHaveBeenCalledWith('example.com');
	});

	it('should return false when DNS resolution fails', async () => {
		mockedLookup.mockRejectedValue(new Error('ENOTFOUND'));

		const result = await resolvesToPrivateIP('nonexistent.invalid');
		expect(result).toBe(false);
	});
});
