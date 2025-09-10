import { PluckFromArrayPipe } from './pluck-from-array.pipe';

describe('PluckFromArrayPipe', () => {
	it('create an instance', () => {
		const pipe = new PluckFromArrayPipe();
		expect(pipe).toBeTruthy();
	});
});
