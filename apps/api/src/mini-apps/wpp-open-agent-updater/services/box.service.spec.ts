import { BoxService } from './box.service';

describe('BoxService.parseModifiedAt', () => {
	const warn = jest.fn();
	const logger = { warn };

	beforeEach(() => warn.mockClear());

	it('unwraps Box DateTimeWrapper { value: Date }', () => {
		const wrapper = { value: new Date('2025-01-15T10:00:00.000Z') };
		const result = BoxService.parseModifiedAt(
			wrapper,
			'foo.pptx',
			'1',
			logger,
		);
		expect(result.toISOString()).toBe('2025-01-15T10:00:00.000Z');
		expect(warn).not.toHaveBeenCalled();
	});

	it('passes a real Date instance through unchanged', () => {
		const date = new Date('2024-06-01T00:00:00.000Z');
		const result = BoxService.parseModifiedAt(
			date,
			'foo.pptx',
			'1',
			logger,
		);
		expect(result).toBe(date);
		expect(warn).not.toHaveBeenCalled();
	});

	it('parses an ISO string', () => {
		const result = BoxService.parseModifiedAt(
			'2024-06-01T00:00:00.000Z',
			'foo.pptx',
			'1',
			logger,
		);
		expect(result.toISOString()).toBe('2024-06-01T00:00:00.000Z');
		expect(warn).not.toHaveBeenCalled();
	});

	it('warns and returns epoch 0 for an empty object', () => {
		const result = BoxService.parseModifiedAt({}, 'foo.pptx', '1', logger);
		expect(result.getTime()).toBe(0);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('No modifiedAt for file foo.pptx'),
		);
	});

	it('warns and returns epoch 0 when missing', () => {
		const result = BoxService.parseModifiedAt(
			undefined,
			'foo.pptx',
			'1',
			logger,
		);
		expect(result.getTime()).toBe(0);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('No modifiedAt for file foo.pptx'),
		);
	});

	it('warns and returns epoch 0 for an invalid date string', () => {
		const result = BoxService.parseModifiedAt(
			'not-a-real-date',
			'foo.pptx',
			'1',
			logger,
		);
		expect(result.getTime()).toBe(0);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				'Invalid modifiedAt date for file foo.pptx',
			),
		);
	});

	it('does NOT fall back to toString() (the previous regression)', () => {
		// DateTimeWrapper-shaped object whose `.value` is *not* a Date should be
		// caught and warned, not silently produce `[object Object]` → Invalid Date.
		const result = BoxService.parseModifiedAt(
			{ notValue: 'whatever' },
			'foo.pptx',
			'1',
			logger,
		);
		expect(result.getTime()).toBe(0);
		expect(warn).toHaveBeenCalled();
	});
});
