import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';

import { SafeHtmlPipe } from './safe-html.pipe';

describe('SafeHtmlPipe', () => {
	let pipe: SafeHtmlPipe;
	let sanitizer: DomSanitizer;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [SafeHtmlPipe],
		});
		sanitizer = TestBed.inject(DomSanitizer);
		pipe = new SafeHtmlPipe(sanitizer);
	});

	it('create an instance', () => {
		expect(pipe).toBeTruthy();
	});
});
