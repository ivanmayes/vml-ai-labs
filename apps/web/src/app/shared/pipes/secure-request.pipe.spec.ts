import { SecureRequestPipe } from './secure-request.pipe';

describe('SecureRequestPipe', () => {
	it('create an instance', () => {
		const pipe = new SecureRequestPipe();
		expect(pipe).toBeTruthy();
	});
});
