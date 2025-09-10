import { EntityFieldMaskPipe } from './entity-field-mask.pipe';

describe('EntityFieldMaskPipe', () => {
	it('create an instance', () => {
		const pipe = new EntityFieldMaskPipe();
		expect(pipe).toBeTruthy();
	});
});
