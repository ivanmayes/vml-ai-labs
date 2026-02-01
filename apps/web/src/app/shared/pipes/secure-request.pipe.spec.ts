import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { SessionQuery } from '../../state/session/session.query';

import { SecureRequestPipe } from './secure-request.pipe';

describe('SecureRequestPipe', () => {
	let pipe: SecureRequestPipe;

	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [HttpClientTestingModule],
			providers: [
				SecureRequestPipe,
				{
					provide: SessionQuery,
					useValue: { getToken: () => 'test-token' },
				},
			],
		});
		pipe = TestBed.inject(SecureRequestPipe);
	});

	it('create an instance', () => {
		expect(pipe).toBeTruthy();
	});
});
