import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
	HttpTestingController,
	provideHttpClientTesting,
} from '@angular/common/http/testing';

import { environment } from '../../../../environments/environment';
import type {
	GeneralExtractionResult,
	TemplateExtractionResult,
} from '../models/extraction.types';
import { isTemplateExtractionResult } from '../models/extraction.types';

import { TextCounterExtractionService } from './text-counter-extraction.service';

const ORG_ID = 'org-123';
const TEMPLATE_ID = 'tpl-abc';

function endpoint(): string {
	return `${environment.apiUrl}/organization/${ORG_ID}/apps/text-counter/extract`;
}

function fakeImage(name = 'creative.png', type = 'image/png'): File {
	return new File([new Uint8Array([1, 2, 3, 4])], name, { type });
}

describe('TextCounterExtractionService', () => {
	let service: TextCounterExtractionService;
	let httpMock: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				TextCounterExtractionService,
			],
		});
		service = TestBed.inject(TextCounterExtractionService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => {
		httpMock.verify();
	});

	it('posts FormData with file + mode=general and no templateId in general mode', (done) => {
		const file = fakeImage();
		const response: GeneralExtractionResult = {
			regions: ['HEADLINE', 'Body copy', 'Visit example.com'],
		};

		service.extract(ORG_ID, file, 'general').subscribe((result) => {
			expect(result).toEqual(response);
			done();
		});

		const req = httpMock.expectOne(endpoint());
		expect(req.request.method).toBe('POST');
		expect(req.request.body instanceof FormData).toBe(true);

		const body = req.request.body as FormData;
		// FormData re-wraps File parts internally, so identity (`toBe`)
		// can fail in some browsers — check user-visible metadata instead.
		const filePart = body.get('file') as File;
		expect(filePart).toBeInstanceOf(File);
		expect(filePart.name).toBe(file.name);
		expect(filePart.type).toBe(file.type);
		expect(filePart.size).toBe(file.size);
		expect(body.get('mode')).toBe('general');
		expect(body.has('templateId')).toBe(false);

		req.flush({ status: 'success', data: response });
	});

	it('posts FormData with file + mode=template + templateId in template mode', (done) => {
		const file = fakeImage('carousel.jpg', 'image/jpeg');
		const response: TemplateExtractionResult = {
			matches: [
				{ label: 'headline', text: 'BIG SALE' },
				{ label: 'body', text: 'Up to 50% off' },
				{ label: 'cta', text: 'Shop Now' },
				{ label: 'disclaimer', text: '' },
			],
			unassigned: ['*Terms apply'],
		};

		service
			.extract(ORG_ID, file, 'template', TEMPLATE_ID)
			.subscribe((result) => {
				expect(result).toEqual(response);
				expect(isTemplateExtractionResult(result)).toBe(true);
				done();
			});

		const req = httpMock.expectOne(endpoint());
		expect(req.request.method).toBe('POST');
		const body = req.request.body as FormData;
		const filePart = body.get('file') as File;
		expect(filePart).toBeInstanceOf(File);
		expect(filePart.name).toBe('carousel.jpg');
		expect(filePart.type).toBe('image/jpeg');
		expect(body.get('mode')).toBe('template');
		expect(body.get('templateId')).toBe(TEMPLATE_ID);

		req.flush({ status: 'success', data: response });
	});

	it('omits templateId when undefined is passed in template-mode (defensive — UI should always supply it)', (done) => {
		const file = fakeImage();

		service.extract(ORG_ID, file, 'template').subscribe(() => done());

		const req = httpMock.expectOne(endpoint());
		const body = req.request.body as FormData;
		expect(body.has('templateId')).toBe(false);

		req.flush({
			status: 'success',
			data: { matches: [], unassigned: [] },
		});
	});

	it('surfaces a 502 AI-parsing failure via the Observable error channel', (done) => {
		const file = fakeImage();

		service.extract(ORG_ID, file, 'general').subscribe({
			next: () => done.fail('expected error'),
			error: (err: HttpErrorResponse) => {
				expect(err.status).toBe(502);
				expect(err.error?.status).toBe('error');
				done();
			},
		});

		const req = httpMock.expectOne(endpoint());
		req.flush(
			{ status: 'error', message: 'extraction failed' },
			{ status: 502, statusText: 'Bad Gateway' },
		);
	});

	it('targets the org-scoped /apps/text-counter/extract URL', (done) => {
		const file = fakeImage();

		service.extract(ORG_ID, file, 'general').subscribe(() => done());

		const req = httpMock.expectOne(endpoint());
		expect(req.request.url).toBe(endpoint());
		req.flush({ status: 'success', data: { regions: [] } });
	});
});
