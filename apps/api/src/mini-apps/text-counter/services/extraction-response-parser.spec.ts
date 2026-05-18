import type {
	ExtractGeneralResponseDto,
	ExtractTemplateResponseDto,
} from '../dtos/extract-response.dto';

import {
	ExtractionParseError,
	parseExtractionResponse,
} from './extraction-response-parser';

describe('parseExtractionResponse', () => {
	describe('general mode', () => {
		it('parses a valid regions array', () => {
			const raw = JSON.stringify({
				regions: ['HEADLINE', 'Body copy', 'Visit example.com'],
			});
			const out = parseExtractionResponse(
				raw,
				'general',
			) as ExtractGeneralResponseDto;
			expect(out.regions).toEqual([
				'HEADLINE',
				'Body copy',
				'Visit example.com',
			]);
		});

		it('parses an empty regions array', () => {
			const out = parseExtractionResponse(
				'{"regions":[]}',
				'general',
			) as ExtractGeneralResponseDto;
			expect(out.regions).toEqual([]);
		});

		it('tolerates extra unknown top-level keys', () => {
			const raw = JSON.stringify({
				regions: ['hello'],
				meta: { reasoning: 'irrelevant' },
				usage: { tokens: 42 },
			});
			const out = parseExtractionResponse(
				raw,
				'general',
			) as ExtractGeneralResponseDto;
			expect(out.regions).toEqual(['hello']);
			expect(
				(out as unknown as Record<string, unknown>).meta,
			).toBeUndefined();
		});

		it('strips ```json fences before parsing', () => {
			const raw = '```json\n{"regions":["a","b"]}\n```';
			const out = parseExtractionResponse(
				raw,
				'general',
			) as ExtractGeneralResponseDto;
			expect(out.regions).toEqual(['a', 'b']);
		});

		it('strips bare ``` fences before parsing', () => {
			const raw = '```\n{"regions":["a"]}\n```';
			const out = parseExtractionResponse(
				raw,
				'general',
			) as ExtractGeneralResponseDto;
			expect(out.regions).toEqual(['a']);
		});

		it('tolerates surrounding whitespace', () => {
			const out = parseExtractionResponse(
				'   \n{"regions":["x"]}\n  ',
				'general',
			) as ExtractGeneralResponseDto;
			expect(out.regions).toEqual(['x']);
		});

		it('throws on missing regions key', () => {
			expect(() =>
				parseExtractionResponse('{"matches":[]}', 'general'),
			).toThrow(ExtractionParseError);
		});

		it('throws on regions containing a non-string entry', () => {
			expect(() =>
				parseExtractionResponse('{"regions":["ok",42]}', 'general'),
			).toThrow(ExtractionParseError);
		});
	});

	describe('template mode', () => {
		it('parses a valid matches + unassigned response', () => {
			const raw = JSON.stringify({
				matches: [
					{ label: 'headline', text: 'HEADLINE' },
					{ label: 'body', text: 'Body copy' },
				],
				unassigned: ['Visit example.com'],
			});
			const out = parseExtractionResponse(
				raw,
				'template',
			) as ExtractTemplateResponseDto;
			expect(out.matches).toEqual([
				{ label: 'headline', text: 'HEADLINE' },
				{ label: 'body', text: 'Body copy' },
			]);
			expect(out.unassigned).toEqual(['Visit example.com']);
		});

		it('parses empty matches and unassigned arrays', () => {
			const out = parseExtractionResponse(
				'{"matches":[],"unassigned":[]}',
				'template',
			) as ExtractTemplateResponseDto;
			expect(out.matches).toEqual([]);
			expect(out.unassigned).toEqual([]);
		});

		it('tolerates extra unknown top-level keys', () => {
			const raw = JSON.stringify({
				matches: [{ label: 'headline', text: 'H' }],
				unassigned: [],
				confidence: 0.91,
			});
			const out = parseExtractionResponse(
				raw,
				'template',
			) as ExtractTemplateResponseDto;
			expect(out.matches).toEqual([{ label: 'headline', text: 'H' }]);
		});

		it('strips a ```json code fence before parsing', () => {
			const raw =
				'```json\n{"matches":[{"label":"a","text":"x"}],"unassigned":[]}\n```';
			const out = parseExtractionResponse(
				raw,
				'template',
			) as ExtractTemplateResponseDto;
			expect(out.matches).toEqual([{ label: 'a', text: 'x' }]);
		});

		it('throws on missing matches key', () => {
			expect(() =>
				parseExtractionResponse('{"unassigned":[]}', 'template'),
			).toThrow(ExtractionParseError);
		});

		it('throws on missing unassigned key', () => {
			expect(() =>
				parseExtractionResponse('{"matches":[]}', 'template'),
			).toThrow(ExtractionParseError);
		});

		it('throws when a match entry is missing label', () => {
			expect(() =>
				parseExtractionResponse(
					'{"matches":[{"text":"x"}],"unassigned":[]}',
					'template',
				),
			).toThrow(ExtractionParseError);
		});

		it('throws when a match entry is missing text', () => {
			expect(() =>
				parseExtractionResponse(
					'{"matches":[{"label":"x"}],"unassigned":[]}',
					'template',
				),
			).toThrow(ExtractionParseError);
		});

		it('throws when unassigned contains a non-string', () => {
			expect(() =>
				parseExtractionResponse(
					'{"matches":[],"unassigned":[42]}',
					'template',
				),
			).toThrow(ExtractionParseError);
		});
	});

	describe('input failures common to both modes', () => {
		it('throws on plain-text non-JSON', () => {
			expect(() =>
				parseExtractionResponse(
					"I'm sorry, I can't help with that.",
					'general',
				),
			).toThrow(ExtractionParseError);
		});

		it('throws on empty string', () => {
			expect(() => parseExtractionResponse('', 'general')).toThrow(
				ExtractionParseError,
			);
		});

		it('throws on whitespace-only input', () => {
			expect(() =>
				parseExtractionResponse('   \n\t  ', 'general'),
			).toThrow(ExtractionParseError);
		});

		it('throws on JSON that is not an object at the top', () => {
			expect(() =>
				parseExtractionResponse(
					'["regions","just an array"]',
					'general',
				),
			).toThrow(ExtractionParseError);
		});

		it('attaches raw text to the error', () => {
			const raw = 'not json';
			try {
				parseExtractionResponse(raw, 'general');
				fail('should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(ExtractionParseError);
				expect((err as ExtractionParseError).raw).toBe(raw);
			}
		});
	});
});
