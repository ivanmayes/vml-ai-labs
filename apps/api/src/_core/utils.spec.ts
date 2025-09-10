import { Test, TestingModule } from '@nestjs/testing';

import * as Utils from './utils';

describe('Utils', () => {
	describe('test time utils', () => {
		it(`should convert '1h' to '1 hours'`, () => {
			expect(Utils.Time.durationStringToSQLFormat('1h'))
				.toBe('1 hours');
		});

		it(`should convert '1h' to 3600000`, () => {
			expect(Utils.Time.durationStringToMs('1h'))
				.toBe(3600000);
		});
	});
});
