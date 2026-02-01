import { ShortNumberPipe } from './short-number.pipe';

describe('ShortNumberPipe', () => {
	let pipe: ShortNumberPipe;

	beforeEach(() => {
		pipe = new ShortNumberPipe();
	});

	it('create an instance', () => {
		expect(pipe).toBeTruthy();
	});
});
