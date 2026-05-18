import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
	HttpTestingController,
	provideHttpClientTesting,
} from '@angular/common/http/testing';

import { environment } from '../../../../environments/environment';
import type {
	CreateTemplatePayload,
	Template,
	UpdateTemplatePayload,
} from '../models/template.types';

import { TextCounterTemplatesService } from './text-counter-templates.service';

const ORG_ID = 'org-123';
const TEMPLATE_ID = 'tpl-abc';

function baseUrl(): string {
	return `${environment.apiUrl}/organization/${ORG_ID}/apps/text-counter/templates`;
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
	return {
		id: TEMPLATE_ID,
		organizationId: ORG_ID,
		createdById: 'user-1',
		name: 'Holiday Carousel',
		createdAt: '2026-05-18T00:00:00.000Z',
		updatedAt: '2026-05-18T00:00:00.000Z',
		fields: [
			{
				id: 'field-1',
				label: 'headline',
				position: 0,
				rules: [{ type: 'maxCharacters', value: 25 }],
			},
		],
		...overrides,
	};
}

describe('TextCounterTemplatesService', () => {
	let service: TextCounterTemplatesService;
	let httpMock: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				TextCounterTemplatesService,
			],
		});
		service = TestBed.inject(TextCounterTemplatesService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => {
		httpMock.verify();
	});

	describe('list', () => {
		it('GETs the org-scoped templates endpoint and unwraps the envelope', (done) => {
			const templates: Template[] = [
				makeTemplate({ id: 'a', name: 'A' }),
				makeTemplate({ id: 'b', name: 'B' }),
			];

			service.list(ORG_ID).subscribe((result) => {
				expect(result).toEqual(templates);
				expect(result.length).toBe(2);
				done();
			});

			const req = httpMock.expectOne(baseUrl());
			expect(req.request.method).toBe('GET');
			req.flush({ status: 'success', data: templates });
		});

		it('surfaces 4xx errors via the Observable error channel', (done) => {
			service.list(ORG_ID).subscribe({
				next: () => done.fail('expected error'),
				error: (err: HttpErrorResponse) => {
					expect(err.status).toBe(403);
					done();
				},
			});

			const req = httpMock.expectOne(baseUrl());
			req.flush(
				{ status: 'error', message: 'forbidden' },
				{ status: 403, statusText: 'Forbidden' },
			);
		});
	});

	describe('get', () => {
		it('GETs a single template by id and unwraps the envelope', (done) => {
			const template = makeTemplate();

			service.get(ORG_ID, TEMPLATE_ID).subscribe((result) => {
				expect(result).toEqual(template);
				done();
			});

			const req = httpMock.expectOne(`${baseUrl()}/${TEMPLATE_ID}`);
			expect(req.request.method).toBe('GET');
			req.flush({ status: 'success', data: template });
		});

		it('surfaces 404 for a missing template', (done) => {
			service.get(ORG_ID, TEMPLATE_ID).subscribe({
				next: () => done.fail('expected error'),
				error: (err: HttpErrorResponse) => {
					expect(err.status).toBe(404);
					done();
				},
			});

			const req = httpMock.expectOne(`${baseUrl()}/${TEMPLATE_ID}`);
			req.flush(
				{ status: 'error', message: 'not found' },
				{ status: 404, statusText: 'Not Found' },
			);
		});
	});

	describe('create', () => {
		it('POSTs the payload and emits the created template', (done) => {
			const payload: CreateTemplatePayload = {
				name: 'Holiday Carousel',
				fields: [
					{
						label: 'headline',
						rules: [{ type: 'maxCharacters', value: 25 }],
					},
				],
			};
			const created = makeTemplate();

			service.create(ORG_ID, payload).subscribe((result) => {
				expect(result).toEqual(created);
				expect(result.id).toBe(TEMPLATE_ID);
				done();
			});

			const req = httpMock.expectOne(baseUrl());
			expect(req.request.method).toBe('POST');
			expect(req.request.body).toEqual(payload);
			req.flush({ status: 'success', data: created });
		});

		it('surfaces 400 validation errors', (done) => {
			const payload: CreateTemplatePayload = {
				name: '',
				fields: [],
			};

			service.create(ORG_ID, payload).subscribe({
				next: () => done.fail('expected error'),
				error: (err: HttpErrorResponse) => {
					expect(err.status).toBe(400);
					done();
				},
			});

			const req = httpMock.expectOne(baseUrl());
			req.flush(
				{ status: 'error', message: 'invalid' },
				{ status: 400, statusText: 'Bad Request' },
			);
		});
	});

	describe('update', () => {
		it('PUTs the payload to the id-scoped url and emits the updated template', (done) => {
			const payload: UpdateTemplatePayload = {
				name: 'Renamed',
				fields: [
					{ label: 'headline', rules: [] },
					{ label: 'body', rules: [{ type: 'singleLine' }] },
				],
			};
			const updated = makeTemplate({ name: 'Renamed' });

			service.update(ORG_ID, TEMPLATE_ID, payload).subscribe((result) => {
				expect(result).toEqual(updated);
				done();
			});

			const req = httpMock.expectOne(`${baseUrl()}/${TEMPLATE_ID}`);
			expect(req.request.method).toBe('PUT');
			expect(req.request.body).toEqual(payload);
			req.flush({ status: 'success', data: updated });
		});
	});

	describe('delete', () => {
		it('DELETEs and emits void on success', (done) => {
			service.delete(ORG_ID, TEMPLATE_ID).subscribe((result) => {
				expect(result).toBeUndefined();
				done();
			});

			const req = httpMock.expectOne(`${baseUrl()}/${TEMPLATE_ID}`);
			expect(req.request.method).toBe('DELETE');
			req.flush({ status: 'success' });
		});

		it('surfaces 404 if the template was already deleted', (done) => {
			service.delete(ORG_ID, TEMPLATE_ID).subscribe({
				next: () => done.fail('expected error'),
				error: (err: HttpErrorResponse) => {
					expect(err.status).toBe(404);
					done();
				},
			});

			const req = httpMock.expectOne(`${baseUrl()}/${TEMPLATE_ID}`);
			req.flush(
				{ status: 'error', message: 'not found' },
				{ status: 404, statusText: 'Not Found' },
			);
		});
	});
});
