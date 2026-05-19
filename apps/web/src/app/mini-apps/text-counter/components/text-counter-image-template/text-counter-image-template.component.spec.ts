import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';

import type {
	ExtractMode,
	ExtractionResult,
	TemplateExtractionResult,
} from '../../models/extraction.types';
import type { Template } from '../../models/template.types';
import { TextCounterExtractionService } from '../../services/text-counter-extraction.service';
import { TextCounterTemplatesService } from '../../services/text-counter-templates.service';
import { CONSENT_STORAGE_KEY } from '../text-counter-consent-banner/text-counter-consent-banner.component';

import { TextCounterImageTemplateComponent } from './text-counter-image-template.component';

const SETTINGS_KEY = 'text-counter:settings:v1';

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

function makeTemplate(overrides: Partial<Template> = {}): Template {
	return {
		id: overrides.id ?? 'tpl-A',
		organizationId: 'org-1',
		createdById: 'user-1',
		name: overrides.name ?? 'Template A',
		createdAt: '2026-05-18T00:00:00.000Z',
		updatedAt: '2026-05-18T00:00:00.000Z',
		fields: overrides.fields ?? [
			{
				id: 'fa-headline',
				label: 'headline',
				position: 0,
				rules: [],
			},
			{ id: 'fa-body', label: 'body', position: 1, rules: [] },
		],
	};
}

function fakeImage(name = 'creative.png'): File {
	return new File([new Uint8Array([1, 2, 3, 4])], name, {
		type: 'image/png',
	});
}

interface ExtractCall {
	orgId: string;
	file: File;
	mode: ExtractMode;
	templateId?: string;
}

class FakeExtractionService {
	readonly calls: ExtractCall[] = [];
	private responders: (() => Observable<ExtractionResult>)[] = [];

	queueSuccess(result: ExtractionResult): void {
		this.responders.push(() => of(result));
	}
	queueError(err: unknown): void {
		this.responders.push(() => throwError(() => err));
	}
	/**
	 * Queue a Subject so the spec can simulate an in-flight extraction
	 * (and observe whether the orchestrator unsubscribes on remove /
	 * template-switch before the result resolves).
	 */
	queuePending(
		subject: Subject<ExtractionResult> | Subject<TemplateExtractionResult>,
	): void {
		this.responders.push(() =>
			(subject as Subject<ExtractionResult>).asObservable(),
		);
	}

	extract(
		orgId: string,
		file: File,
		mode: ExtractMode,
		templateId?: string,
	): Observable<ExtractionResult> {
		this.calls.push({ orgId, file, mode, templateId });
		const next = this.responders.shift();
		if (!next) {
			return throwError(
				() => new Error('No response queued for extract() call'),
			);
		}
		return next();
	}
}

class FakeTemplatesService {
	listResponses: Template[][] = [];
	listError: unknown = null;

	queueList(list: Template[]): void {
		this.listResponses.push(list);
	}
	queueListError(err: unknown): void {
		this.listError = err;
	}

	list(_orgId: string): Observable<Template[]> {
		if (this.listError !== null) {
			const err = this.listError;
			this.listError = null;
			return throwError(() => err);
		}
		const next = this.listResponses.shift() ?? [];
		return of(next);
	}

	get() {
		return throwError(() => new Error('not used'));
	}
	create() {
		return throwError(() => new Error('not used'));
	}
	update() {
		return throwError(() => new Error('not used'));
	}
	delete() {
		return throwError(() => new Error('not used'));
	}
}

function buildWith(args: {
	extraction: FakeExtractionService;
	templates: FakeTemplatesService;
}): ComponentFixture<TextCounterImageTemplateComponent> {
	TestBed.configureTestingModule({
		imports: [TextCounterImageTemplateComponent],
		providers: [
			provideNoopAnimations(),
			{
				provide: TextCounterExtractionService,
				useValue: args.extraction,
			},
			{ provide: TextCounterTemplatesService, useValue: args.templates },
		],
	});
	const fixture = TestBed.createComponent(TextCounterImageTemplateComponent);
	fixture.detectChanges();
	return fixture;
}

// ---------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------

describe('TextCounterImageTemplateComponent', () => {
	let extraction: FakeExtractionService;
	let templates: FakeTemplatesService;

	beforeEach(() => {
		localStorage.removeItem(SETTINGS_KEY);
		// Pre-accept consent for the default suite so existing tests
		// continue to exercise the post-consent extraction flow. Tests
		// that exercise the consent gate explicitly clear this flag.
		localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted');
		spyOn(URL, 'createObjectURL').and.callFake(() => 'blob:fake');
		spyOn(URL, 'revokeObjectURL').and.callFake(() => undefined);
		extraction = new FakeExtractionService();
		templates = new FakeTemplatesService();
	});

	afterEach(() => {
		localStorage.removeItem(SETTINGS_KEY);
		localStorage.removeItem(CONSENT_STORAGE_KEY);
	});

	// -----------------------------------------------------------------
	// Template list loading
	// -----------------------------------------------------------------

	it('loads templates on mount via TextCounterTemplatesService.list', () => {
		const tpl = makeTemplate();
		templates.queueList([tpl]);
		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		expect(c.templates()).toEqual([tpl]);
		expect(c.templatesLoaded()).toBe(true);
	});

	it('surfaces a templatesError when list() fails', () => {
		templates.queueListError(
			new HttpErrorResponse({ status: 500, statusText: 'Server' }),
		);
		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		expect(c.templatesLoaded()).toBe(true);
		expect(c.templatesError()).not.toBeNull();
	});

	// -----------------------------------------------------------------
	// Upload — creates one pending card per file with no template yet
	// -----------------------------------------------------------------

	it('creates one pending card per uploaded file without auto-firing extraction', () => {
		const tpl = makeTemplate();
		templates.queueList([tpl]);
		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage('a.png'), fakeImage('b.png')] });
		fixture.detectChanges();

		expect(c.imageCards().length).toBe(2);
		expect(c.imageCards().every((card) => card.status === 'pending')).toBe(
			true,
		);
		expect(c.imageCards().every((card) => card.templateId === null)).toBe(
			true,
		);
		expect(extraction.calls.length).toBe(0);
	});

	it('does not render the consent banner before any image is uploaded (M11)', () => {
		templates.queueList([makeTemplate()]);
		const fixture = buildWith({ extraction, templates });
		const banner = fixture.nativeElement.querySelector(
			'app-text-counter-consent-banner',
		);
		expect(banner).toBeNull();
	});

	it('renders the consent banner after the first image upload', () => {
		templates.queueList([makeTemplate()]);
		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		const banner = fixture.nativeElement.querySelector(
			'app-text-counter-consent-banner',
		);
		expect(banner).not.toBeNull();
	});

	it('defers the FIRST extraction call until consent is accepted (gates the AI POST)', () => {
		// Clear the pre-accepted flag set by beforeEach for this test.
		localStorage.removeItem(CONSENT_STORAGE_KEY);
		const tpl = makeTemplate({ id: 'tpl-gate' });
		templates.queueList([tpl]);
		extraction.queueSuccess({
			matches: [
				{ label: 'headline', text: 'H-text' },
				{ label: 'body', text: 'B-text' },
			],
			unassigned: [],
		} as TemplateExtractionResult);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();
		c.onTemplateChange(c.imageCards()[0].id, 'tpl-gate');
		c.onExtractClicked(c.imageCards()[0].id);
		fixture.detectChanges();

		// Card is in extracting state but the AI POST has NOT fired.
		expect(c.imageCards()[0].status).toBe('extracting');
		expect(extraction.calls.length).toBe(0);

		// Simulate the banner setting the flag, then emitting accepted.
		localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted');
		c.onConsentAccepted();
		fixture.detectChanges();

		expect(extraction.calls.length).toBe(1);
		expect(c.imageCards()[0].status).toBe('done');
		expect(c.imageCards()[0].assignments['fa-headline']).toBe('H-text');
	});

	// -----------------------------------------------------------------
	// AE7 — different templates per card, independent
	// -----------------------------------------------------------------

	it("lets each card pick its own template and renders that template's fields (AE7)", () => {
		const tplA = makeTemplate({
			id: 'tpl-A',
			name: 'Template A',
			fields: [
				{ id: 'A-headline', label: 'headline', position: 0, rules: [] },
			],
		});
		const tplB = makeTemplate({
			id: 'tpl-B',
			name: 'Template B',
			fields: [
				{
					id: 'B-disclaimer',
					label: 'disclaimer',
					position: 0,
					rules: [],
				},
				{ id: 'B-cta', label: 'cta', position: 1, rules: [] },
			],
		});
		templates.queueList([tplA, tplB]);

		// Two extraction responses queued — one per card.
		extraction.queueSuccess({
			matches: [{ label: 'headline', text: 'HEAD' }],
			unassigned: [],
		} as TemplateExtractionResult);
		extraction.queueSuccess({
			matches: [
				{ label: 'disclaimer', text: 'Promo terms apply.' },
				{ label: 'cta', text: 'Shop now' },
			],
			unassigned: [],
		} as TemplateExtractionResult);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage('a.png'), fakeImage('b.png')] });
		fixture.detectChanges();

		// Card 1 picks template A; card 2 picks template B.
		const [card1, card2] = c.imageCards();
		c.onTemplateChange(card1.id, 'tpl-A');
		c.onExtractClicked(card1.id);
		c.onTemplateChange(card2.id, 'tpl-B');
		c.onExtractClicked(card2.id);
		fixture.detectChanges();

		expect(extraction.calls.length).toBe(2);
		expect(extraction.calls[0].templateId).toBe('tpl-A');
		expect(extraction.calls[1].templateId).toBe('tpl-B');

		const [done1, done2] = c.imageCards();
		expect(done1.status).toBe('done');
		expect(done1.assignments['A-headline']).toBe('HEAD');
		expect(done2.status).toBe('done');
		expect(done2.assignments['B-cta']).toBe('Shop now');
		expect(done2.assignments['B-disclaimer']).toBe('Promo terms apply.');
		// Switching card 1's view didn't affect card 2's assignments.
		expect(done2.assignments['A-headline']).toBeUndefined();
	});

	// -----------------------------------------------------------------
	// AE6 — two cards rendered. The image-card component is what owns
	// drag scoping, but the orchestrator must surface two cards with
	// distinct ids.
	// -----------------------------------------------------------------

	it('renders two distinct cards, each with its own id (AE6)', () => {
		templates.queueList([makeTemplate()]);
		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage('a.png'), fakeImage('b.png')] });
		fixture.detectChanges();

		const ids = c.imageCards().map((card) => card.id);
		expect(new Set(ids).size).toBe(2);

		const rendered = fixture.nativeElement.querySelectorAll(
			'app-text-counter-image-card',
		);
		expect(rendered.length).toBe(2);
	});

	// -----------------------------------------------------------------
	// AE2 — initial extraction populates field assignments + pool
	// -----------------------------------------------------------------

	it('maps template extraction matches by label and routes orphans to the pool (AE2)', () => {
		const tpl = makeTemplate({
			id: 'tpl-1',
			fields: [
				{ id: 'f-headline', label: 'headline', position: 0, rules: [] },
				{ id: 'f-subhead', label: 'subhead', position: 1, rules: [] },
				{ id: 'f-body', label: 'body', position: 2, rules: [] },
				{ id: 'f-cta', label: 'cta', position: 3, rules: [] },
			],
		});
		templates.queueList([tpl]);

		extraction.queueSuccess({
			matches: [
				{ label: 'headline', text: 'HOLIDAY SALE' },
				{ label: 'subhead', text: 'Up to 40% off' },
				{ label: 'body', text: 'Body copy paragraph' },
				{ label: 'cta', text: 'Shop now' },
			],
			unassigned: ['v1sit example.c0m'],
		} as TemplateExtractionResult);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();
		c.onTemplateChange(c.imageCards()[0].id, 'tpl-1');
		c.onExtractClicked(c.imageCards()[0].id);
		fixture.detectChanges();

		const card = c.imageCards()[0];
		expect(card.status).toBe('done');
		expect(card.assignments['f-headline']).toBe('HOLIDAY SALE');
		expect(card.assignments['f-cta']).toBe('Shop now');
		expect(card.unassigned).toEqual(['v1sit example.c0m']);
	});

	// -----------------------------------------------------------------
	// Per-card extraction error doesn't affect other cards
	// -----------------------------------------------------------------

	it('isolates per-card extraction failures (one card errors, others succeed)', () => {
		const tpl = makeTemplate({
			id: 'tpl-X',
			fields: [{ id: 'f1', label: 'headline', position: 0, rules: [] }],
		});
		templates.queueList([tpl]);

		extraction.queueSuccess({
			matches: [{ label: 'headline', text: 'ok-1' }],
			unassigned: [],
		} as TemplateExtractionResult);
		extraction.queueError(
			new HttpErrorResponse({ status: 502, statusText: 'Bad Gateway' }),
		);
		extraction.queueSuccess({
			matches: [{ label: 'headline', text: 'ok-3' }],
			unassigned: [],
		} as TemplateExtractionResult);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({
			files: [fakeImage('a.png'), fakeImage('b.png'), fakeImage('c.png')],
		});
		fixture.detectChanges();

		const [c1, c2, c3] = c.imageCards();
		c.onTemplateChange(c1.id, 'tpl-X');
		c.onExtractClicked(c1.id);
		c.onTemplateChange(c2.id, 'tpl-X');
		c.onExtractClicked(c2.id);
		c.onTemplateChange(c3.id, 'tpl-X');
		c.onExtractClicked(c3.id);
		fixture.detectChanges();

		const cards = c.imageCards();
		expect(cards[0].status).toBe('done');
		expect(cards[1].status).toBe('error');
		expect(cards[2].status).toBe('done');
		expect(cards[0].assignments['f1']).toBe('ok-1');
		expect(cards[2].assignments['f1']).toBe('ok-3');
	});

	// -----------------------------------------------------------------
	// 404 on deleted template
	// -----------------------------------------------------------------

	it('flags a card whose selected template was deleted (404) so the UI can prompt to pick another', () => {
		const tpl = makeTemplate({ id: 'tpl-zombie' });
		templates.queueList([tpl]);
		extraction.queueError(
			new HttpErrorResponse({
				status: 404,
				statusText: 'Not Found',
				error: { status: 'error', message: 'template not found' },
			}),
		);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();
		const cardId = c.imageCards()[0].id;
		c.onTemplateChange(cardId, 'tpl-zombie');
		c.onExtractClicked(cardId);
		fixture.detectChanges();

		expect(c.imageCards()[0].status).toBe('error');
		expect(c.deletedTemplateForCard()[cardId]).toBe(true);
	});

	it('clears the deleted-template flag when a card switches to a different template', () => {
		const tpl = makeTemplate({ id: 'tpl-2' });
		templates.queueList([tpl]);
		extraction.queueError(
			new HttpErrorResponse({ status: 404, statusText: 'Not Found' }),
		);
		extraction.queueSuccess({
			matches: [],
			unassigned: [],
		} as TemplateExtractionResult);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();
		const cardId = c.imageCards()[0].id;
		c.onTemplateChange(cardId, 'tpl-2');
		c.onExtractClicked(cardId);
		fixture.detectChanges();
		expect(c.deletedTemplateForCard()[cardId]).toBe(true);

		// Reset to the same id (simulating "pick another" after refresh).
		c.onTemplateChange(cardId, null);
		c.onTemplateChange(cardId, 'tpl-2');
		fixture.detectChanges();

		expect(c.deletedTemplateForCard()[cardId]).toBeUndefined();
	});

	// -----------------------------------------------------------------
	// AE9 — no persistence
	// -----------------------------------------------------------------

	it('persists no image entries, assignments, or templateId per card to localStorage (AE9)', () => {
		const tpl = makeTemplate({ id: 'tpl-A' });
		templates.queueList([tpl]);
		extraction.queueSuccess({
			matches: [{ label: 'headline', text: 'SECRET-LINE' }],
			unassigned: ['another-secret-chunk'],
		} as TemplateExtractionResult);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage('secret-file.png')] });
		fixture.detectChanges();
		c.onTemplateChange(c.imageCards()[0].id, 'tpl-A');
		c.onExtractClicked(c.imageCards()[0].id);
		fixture.detectChanges();

		const all: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i)!;
			all.push(k);
			all.push(localStorage.getItem(k) ?? '');
		}
		const joined = all.join('|');
		expect(joined).not.toContain('SECRET-LINE');
		expect(joined).not.toContain('another-secret-chunk');
		expect(joined).not.toContain('secret-file.png');
		expect(joined).not.toContain('tpl-A');
	});

	// -----------------------------------------------------------------
	// Retry
	// -----------------------------------------------------------------

	it('onRetry re-runs extraction for the card', () => {
		const tpl = makeTemplate({ id: 'tpl-retry' });
		templates.queueList([tpl]);

		extraction.queueError(
			new HttpErrorResponse({ status: 502, statusText: 'Bad Gateway' }),
		);
		extraction.queueSuccess({
			matches: [
				{ label: 'headline', text: 'Recovered' },
				{ label: 'body', text: 'And body' },
			],
			unassigned: [],
		} as TemplateExtractionResult);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();
		const cardId = c.imageCards()[0].id;
		c.onTemplateChange(cardId, 'tpl-retry');
		c.onExtractClicked(cardId);
		fixture.detectChanges();
		expect(c.imageCards()[0].status).toBe('error');

		c.onRetry(cardId);
		fixture.detectChanges();

		expect(c.imageCards()[0].status).toBe('done');
		expect(extraction.calls.length).toBe(2);
	});

	// -----------------------------------------------------------------
	// Remove
	// -----------------------------------------------------------------

	it('removes a card and revokes its preview URL', () => {
		templates.queueList([makeTemplate()]);
		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({
			files: [fakeImage('a.png'), fakeImage('b.png')],
		});
		fixture.detectChanges();

		const firstId = c.imageCards()[0].id;
		c.onRemove(firstId);
		fixture.detectChanges();

		expect(c.imageCards().length).toBe(1);
		expect(URL.revokeObjectURL).toHaveBeenCalled();
	});

	it('cancels an in-flight extraction subscription when the card is removed before the result arrives', () => {
		const tpl = makeTemplate({ id: 'tpl-pending' });
		templates.queueList([tpl]);

		// Queue a never-resolving Subject so the orchestrator's subscribe()
		// stays open until we either tear it down or push a value.
		const pending = new Subject<TemplateExtractionResult>();
		extraction.queuePending(pending);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();
		const cardId = c.imageCards()[0].id;
		c.onTemplateChange(cardId, 'tpl-pending');
		c.onExtractClicked(cardId);
		fixture.detectChanges();

		expect(c.imageCards()[0].status).toBe('extracting');
		expect(pending.observed).toBe(true);

		c.onRemove(cardId);
		fixture.detectChanges();

		// After removal the Subject should have no subscribers — the
		// orchestrator unsubscribed before tearing the card down.
		expect(pending.observed).toBe(false);
		expect(c.imageCards().length).toBe(0);
	});

	it('re-resolves the template at response time so mid-flight edits map to the current field IDs', () => {
		// Template starts with `headline`/`body` fields (ids fa-headline/fa-body).
		const original = makeTemplate({ id: 'tpl-edit-midflight' });
		templates.queueList([original]);

		// Use a Subject so the spec can edit the template before the
		// response resolves.
		const pending = new Subject<TemplateExtractionResult>();
		extraction.queuePending(pending);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();
		const cardId = c.imageCards()[0].id;
		c.onTemplateChange(cardId, 'tpl-edit-midflight');
		c.onExtractClicked(cardId);
		fixture.detectChanges();
		expect(c.imageCards()[0].status).toBe('extracting');

		// User edits the template mid-flight: same labels, different IDs
		// (simulates the pre-Fix-4 server behavior where saves regenerated
		// every field UUID).
		const edited: Template = {
			...original,
			fields: [
				{
					id: 'new-headline',
					label: 'headline',
					position: 0,
					rules: [],
				},
				{ id: 'new-body', label: 'body', position: 1, rules: [] },
			],
		};
		c.onEditorSaved(edited);
		fixture.detectChanges();

		// Now the AI response arrives.
		pending.next({
			matches: [
				{ label: 'headline', text: 'H-text' },
				{ label: 'body', text: 'B-text' },
			],
			unassigned: [],
		} as TemplateExtractionResult);
		pending.complete();
		fixture.detectChanges();

		const card = c.imageCards()[0];
		expect(card.status).toBe('done');
		// Assignments are keyed by the NEW (live) field IDs, not the stale
		// IDs captured when the request was issued.
		expect(card.assignments['new-headline']).toBe('H-text');
		expect(card.assignments['new-body']).toBe('B-text');
	});

	it('cancels an in-flight extraction when the user switches to a different template mid-extraction', () => {
		const tplA = makeTemplate({ id: 'tpl-A' });
		const tplB = makeTemplate({ id: 'tpl-B' });
		templates.queueList([tplA, tplB]);

		const firstPending = new Subject<TemplateExtractionResult>();
		extraction.queuePending(firstPending);
		extraction.queueSuccess({
			matches: [
				{ label: 'headline', text: 'B-headline' },
				{ label: 'body', text: 'B-body' },
			],
			unassigned: [],
		} as TemplateExtractionResult);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();
		const cardId = c.imageCards()[0].id;
		c.onTemplateChange(cardId, 'tpl-A');
		c.onExtractClicked(cardId);
		fixture.detectChanges();
		expect(firstPending.observed).toBe(true);

		c.onTemplateChange(cardId, 'tpl-B');
		c.onExtractClicked(cardId);
		fixture.detectChanges();

		// First extraction's Subject should now be unsubscribed.
		expect(firstPending.observed).toBe(false);
		// Second extraction fires and resolves immediately.
		expect(c.imageCards()[0].status).toBe('done');
		expect(c.imageCards()[0].assignments['fa-headline']).toBe('B-headline');
	});

	// -----------------------------------------------------------------
	// Template editor wiring
	// -----------------------------------------------------------------

	it('opens the template editor when a card emits manageTemplatesClicked', () => {
		templates.queueList([]);
		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onManageTemplatesClickedFromCard();
		fixture.detectChanges();

		expect(c.editorVisible()).toBe(true);
		expect(c.editorMode()).toBe('create');
	});

	it('merges a newly saved template into the local list without re-fetching', () => {
		templates.queueList([]); // initial mount — empty
		const newTpl = makeTemplate({ id: 'tpl-new', name: 'New One' });

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		expect(c.templates()).toEqual([]);

		c.onEditorSaved(newTpl);
		fixture.detectChanges();

		expect(c.templates()).toEqual([newTpl]);
		expect(c.editorVisible()).toBe(false);
	});

	it('replaces an existing template in place when the editor reports an update', () => {
		const original = makeTemplate({ id: 'tpl-edit', name: 'Original' });
		templates.queueList([original]);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		const updated: Template = { ...original, name: 'Updated' };
		c.onEditorSaved(updated);
		fixture.detectChanges();

		expect(c.templates().length).toBe(1);
		expect(c.templates()[0].name).toBe('Updated');
	});

	it('removes a deleted template from the local list without re-fetching', () => {
		const tpl = makeTemplate({ id: 'tpl-del' });
		templates.queueList([tpl]);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		expect(c.templates().length).toBe(1);

		c.onEditorDeleted('tpl-del');
		fixture.detectChanges();

		expect(c.templates()).toEqual([]);
	});

	it('flags any card using the deleted template after editor delete (so the UI can prompt)', () => {
		const tpl = makeTemplate({ id: 'tpl-shared' });
		templates.queueList([tpl]);
		extraction.queueSuccess({
			matches: [
				{ label: 'headline', text: 'H' },
				{ label: 'body', text: 'B' },
			],
			unassigned: [],
		} as TemplateExtractionResult);

		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();
		const cardId = c.imageCards()[0].id;
		c.onTemplateChange(cardId, 'tpl-shared');
		c.onExtractClicked(cardId);
		fixture.detectChanges();

		c.onEditorDeleted('tpl-shared');
		fixture.detectChanges();

		expect(c.deletedTemplateForCard()[cardId]).toBe(true);
	});

	// -----------------------------------------------------------------
	// Card state mutations from card events
	// -----------------------------------------------------------------

	it("onAssignmentChange merges into the card's assignments without touching others", () => {
		templates.queueList([makeTemplate()]);
		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		const cardId = c.imageCards()[0].id;
		c.onAssignmentChange(cardId, { fieldId: 'f-1', text: 'A' });
		c.onAssignmentChange(cardId, { fieldId: 'f-2', text: 'B' });
		c.onAssignmentChange(cardId, { fieldId: 'f-1', text: 'A-updated' });
		fixture.detectChanges();

		expect(c.imageCards()[0].assignments).toEqual({
			'f-1': 'A-updated',
			'f-2': 'B',
		});
	});

	it('onUnassignedChange replaces the pool wholesale', () => {
		templates.queueList([makeTemplate()]);
		const fixture = buildWith({ extraction, templates });
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		const cardId = c.imageCards()[0].id;
		c.onUnassignedChange(cardId, ['first', 'second']);
		fixture.detectChanges();
		expect(c.imageCards()[0].unassigned).toEqual(['first', 'second']);

		c.onUnassignedChange(cardId, ['only-one']);
		fixture.detectChanges();
		expect(c.imageCards()[0].unassigned).toEqual(['only-one']);
	});
});
