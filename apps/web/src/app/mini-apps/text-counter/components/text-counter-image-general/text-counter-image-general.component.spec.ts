import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';

import type {
	ExtractMode,
	ExtractionResult,
	GeneralExtractionResult,
} from '../../models/extraction.types';
import { TextCounterExtractionService } from '../../services/text-counter-extraction.service';
import { CONSENT_STORAGE_KEY } from '../text-counter-consent-banner/text-counter-consent-banner.component';

import { TextCounterImageGeneralComponent } from './text-counter-image-general.component';

const SETTINGS_KEY = 'text-counter:settings:v1';

interface ExtractCall {
	orgId: string;
	file: File;
	mode: ExtractMode;
	templateId?: string;
}

class FakeExtractionService {
	readonly calls: ExtractCall[] = [];

	// Queue of responders consumed in order — one entry per call.
	private responders: (() => Observable<ExtractionResult>)[] = [];

	queueSuccess(result: ExtractionResult): void {
		this.responders.push(() => of(result));
	}

	queueError(err: unknown): void {
		this.responders.push(() => throwError(() => err));
	}

	queueDeferred(): Subject<ExtractionResult> {
		const subj = new Subject<ExtractionResult>();
		this.responders.push(() => subj.asObservable());
		return subj;
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

function fakeImage(name = 'creative.png', type = 'image/png'): File {
	return new File([new Uint8Array([1, 2, 3, 4])], name, { type });
}

function buildWith(
	fake: FakeExtractionService,
): ComponentFixture<TextCounterImageGeneralComponent> {
	TestBed.configureTestingModule({
		imports: [TextCounterImageGeneralComponent],
		providers: [
			provideNoopAnimations(),
			{ provide: TextCounterExtractionService, useValue: fake },
		],
	});
	const fixture = TestBed.createComponent(TextCounterImageGeneralComponent);
	fixture.detectChanges();
	return fixture;
}

describe('TextCounterImageGeneralComponent', () => {
	let fake: FakeExtractionService;

	beforeEach(() => {
		localStorage.removeItem(SETTINGS_KEY);
		// Pre-accept consent for the default suite so existing tests
		// continue to exercise the post-consent extraction flow. Tests
		// that exercise the consent gate explicitly clear this flag.
		localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted');
		// Stable object-URL stubs so we don't lean on jsdom's URL impl.
		spyOn(URL, 'createObjectURL').and.callFake(() => 'blob:fake');
		spyOn(URL, 'revokeObjectURL').and.callFake(() => undefined);
		fake = new FakeExtractionService();
	});

	afterEach(() => {
		localStorage.removeItem(SETTINGS_KEY);
		localStorage.removeItem(CONSENT_STORAGE_KEY);
	});

	// -------------------------------------------------------------------
	// AE1 — single image, three regions, three rows with counts
	// -------------------------------------------------------------------

	it('renders one row per extracted region with computed counts (AE1)', () => {
		const response: GeneralExtractionResult = {
			regions: ['HEADLINE', 'Body copy paragraph', 'Visit example.com'],
		};
		fake.queueSuccess(response);

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		expect(c.images().length).toBe(1);
		const entry = c.images()[0];
		expect(entry.status).toBe('done');
		expect(entry.rows.map((r) => r.text)).toEqual([
			'HEADLINE',
			'Body copy paragraph',
			'Visit example.com',
		]);

		const views = c.rowViews()[entry.id];
		expect(views.length).toBe(3);
		expect(views[0].stats.characters).toBe('HEADLINE'.length);
		expect(views[0].stats.words).toBe(1);
		expect(views[1].stats.words).toBe(3);
		expect(views[2].stats.characters).toBe('Visit example.com'.length);
	});

	// -------------------------------------------------------------------
	// Multi-image upload — three files, each finishes independently
	// -------------------------------------------------------------------

	it('handles multi-image upload with independent completion', () => {
		fake.queueSuccess({ regions: ['A1', 'A2'] });
		fake.queueSuccess({ regions: ['B1'] });
		fake.queueSuccess({ regions: ['C1', 'C2', 'C3'] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({
			files: [fakeImage('a.png'), fakeImage('b.png'), fakeImage('c.png')],
		});
		fixture.detectChanges();

		expect(fake.calls.length).toBe(3);
		expect(c.images().length).toBe(3);
		expect(c.images().every((e) => e.status === 'done')).toBe(true);
		expect(c.images().map((e) => e.rows.length)).toEqual([2, 1, 3]);
	});

	// -------------------------------------------------------------------
	// Per-card error + retry
	// -------------------------------------------------------------------

	it('surfaces a per-image extraction error with a Retry that re-fires the call', () => {
		// First call fails, second (retry) succeeds.
		fake.queueError(
			new HttpErrorResponse({
				status: 502,
				statusText: 'Bad Gateway',
				error: { status: 'error', message: 'AI parse failed' },
			}),
		);
		fake.queueSuccess({ regions: ['Recovered'] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		const entryId = c.images()[0].id;
		expect(c.images()[0].status).toBe('error');
		expect(c.images()[0].error).toBe('AI parse failed');

		c.retry(entryId);
		fixture.detectChanges();

		expect(fake.calls.length).toBe(2);
		expect(c.images()[0].status).toBe('done');
		expect(c.images()[0].rows.map((r) => r.text)).toEqual(['Recovered']);
	});

	it('keeps other cards rendering normally when one image errors', () => {
		fake.queueSuccess({ regions: ['ok-1'] });
		fake.queueError(new HttpErrorResponse({ status: 500 }));
		fake.queueSuccess({ regions: ['ok-3'] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({
			files: [fakeImage('a.png'), fakeImage('b.png'), fakeImage('c.png')],
		});
		fixture.detectChanges();

		expect(c.images().map((e) => e.status)).toEqual([
			'done',
			'error',
			'done',
		]);
		expect(c.images()[0].rows[0].text).toBe('ok-1');
		expect(c.images()[2].rows[0].text).toBe('ok-3');
	});

	// -------------------------------------------------------------------
	// Inline edit — counts update immediately
	// -------------------------------------------------------------------

	it('recomputes counts when a row is inline-edited', () => {
		fake.queueSuccess({ regions: ['hello'] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		const entry = c.images()[0];
		const rowId = entry.rows[0].id;

		expect(c.rowViews()[entry.id][0].stats.characters).toBe(5);

		c.onRowTextChange(entry.id, rowId, 'hello world');
		expect(c.rowViews()[entry.id][0].text).toBe('hello world');
		expect(c.rowViews()[entry.id][0].stats.characters).toBe(11);
		expect(c.rowViews()[entry.id][0].stats.words).toBe(2);
	});

	it('coerces null / undefined inline-edit values to empty string', () => {
		fake.queueSuccess({ regions: ['x'] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		const entry = c.images()[0];
		const rowId = entry.rows[0].id;

		c.onRowTextChange(entry.id, rowId, null);
		expect(c.rowViews()[entry.id][0].text).toBe('');
		expect(c.rowViews()[entry.id][0].stats.characters).toBe(0);
	});

	// -------------------------------------------------------------------
	// Settings change recomputes all rendered rows
	// -------------------------------------------------------------------

	it('recomputes all rendered row counts when settings change', () => {
		fake.queueSuccess({ regions: ['hello world'] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		const entry = c.images()[0];

		// Default counts whitespace.
		expect(c.rowViews()[entry.id][0].stats.characters).toBe(11);

		c.settings.update((s) => ({ ...s, countWhitespaceAsCharacter: false }));
		expect(c.rowViews()[entry.id][0].stats.characters).toBe(10);
	});

	// -------------------------------------------------------------------
	// Extracting state visible to the user
	// -------------------------------------------------------------------

	it('renders an extracting state until the response arrives', () => {
		const deferred = fake.queueDeferred();

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		expect(c.images()[0].status).toBe('extracting');

		deferred.next({ regions: ['done'] });
		deferred.complete();
		fixture.detectChanges();

		expect(c.images()[0].status).toBe('done');
		expect(c.images()[0].rows[0].text).toBe('done');
	});

	// -------------------------------------------------------------------
	// Remove
	// -------------------------------------------------------------------

	it('cancels an in-flight extraction subscription when the entry is removed before the result arrives', () => {
		const pending = fake.queueDeferred();

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		const entryId = c.images()[0].id;
		expect(c.images()[0].status).toBe('extracting');
		expect(pending.observed).toBe(true);

		c.remove(entryId);
		fixture.detectChanges();

		// The pending subject should have no subscribers anymore.
		expect(pending.observed).toBe(false);
		expect(c.images().length).toBe(0);
	});

	it('cancels the previous extraction subscription when retry fires before the prior call completes', () => {
		const firstPending = fake.queueDeferred();
		fake.queueSuccess({ regions: ['Recovered'] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		const entryId = c.images()[0].id;
		expect(c.images()[0].status).toBe('extracting');
		expect(firstPending.observed).toBe(true);

		c.retry(entryId);
		fixture.detectChanges();

		// First call's Subject should be unsubscribed; second extraction
		// is now in flight (queueSuccess resolves synchronously via `of`).
		expect(firstPending.observed).toBe(false);
		expect(fake.calls.length).toBe(2);
		expect(c.images()[0].status).toBe('done');
		expect(c.images()[0].rows[0].text).toBe('Recovered');
	});

	it('removes an entry and revokes its preview URL', () => {
		fake.queueSuccess({ regions: ['a'] });
		fake.queueSuccess({ regions: ['b'] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({
			files: [fakeImage('a.png'), fakeImage('b.png')],
		});
		fixture.detectChanges();

		const firstId = c.images()[0].id;
		c.remove(firstId);
		fixture.detectChanges();

		expect(c.images().length).toBe(1);
		expect(URL.revokeObjectURL).toHaveBeenCalled();
	});

	// -------------------------------------------------------------------
	// AE9 — no persistence of images or row text
	// -------------------------------------------------------------------

	it('persists no image entries or row text to localStorage (AE9)', () => {
		fake.queueSuccess({ regions: ['secret-line-1', 'secret-line-2'] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		c.onRowTextChange(
			c.images()[0].id,
			c.images()[0].rows[0].id,
			'edited locally',
		);

		// Walk every localStorage key — none of our row text or filenames
		// should be stored anywhere. `expect` runs unconditionally so the
		// spec always has at least one assertion even when localStorage
		// is empty (the intended steady state).
		const allValues: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i)!;
			allValues.push(localStorage.getItem(key) ?? '');
		}
		const joined = allValues.join('|');
		expect(joined).not.toContain('secret-line-1');
		expect(joined).not.toContain('secret-line-2');
		expect(joined).not.toContain('edited locally');
	});

	// -------------------------------------------------------------------
	// Consent banner
	// -------------------------------------------------------------------

	it('does not render the consent banner before any image is uploaded', () => {
		const fixture = buildWith(fake);
		const banner = fixture.nativeElement.querySelector(
			'app-text-counter-consent-banner',
		);
		expect(banner).toBeNull();
	});

	it('renders the consent banner after the first image upload', () => {
		fake.queueSuccess({ regions: [] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		const banner = fixture.nativeElement.querySelector(
			'app-text-counter-consent-banner',
		);
		expect(banner).not.toBeNull();
	});

	it('does not fire extraction on the first upload until consent is accepted (gates the FIRST AI call)', () => {
		// Clear the pre-accepted flag set by beforeEach for this test.
		localStorage.removeItem(CONSENT_STORAGE_KEY);
		fake.queueSuccess({ regions: ['HEAD'] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		// Image entry exists in extracting state, but the AI POST has
		// NOT fired — the request is gated on consent acceptance.
		expect(c.images().length).toBe(1);
		expect(c.images()[0].status).toBe('extracting');
		expect(fake.calls.length).toBe(0);

		// Simulate the banner setting the flag, then emitting accepted.
		localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted');
		c.onConsentAccepted();
		fixture.detectChanges();

		expect(fake.calls.length).toBe(1);
		expect(c.images()[0].status).toBe('done');
		expect(c.images()[0].rows[0].text).toBe('HEAD');
	});

	it('fires extraction immediately when consent was previously accepted', () => {
		localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted');
		fake.queueSuccess({ regions: ['ok'] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		// Extraction fires synchronously — no consent gating needed.
		expect(fake.calls.length).toBe(1);
		expect(c.images()[0].status).toBe('done');
	});

	it('does not re-show the consent banner when the accepted flag is already set', () => {
		localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted');
		fake.queueSuccess({ regions: [] });

		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [fakeImage()] });
		fixture.detectChanges();

		// The host renders the banner element, but the banner itself
		// keeps its inner content hidden via its own `visible` signal.
		const inner = fixture.nativeElement.querySelector('.consent-banner');
		expect(inner).toBeNull();
	});

	// -------------------------------------------------------------------
	// File rejection — no entries created for an empty file list
	// -------------------------------------------------------------------

	it('creates no entries when the upload handler is invoked with no files', () => {
		const fixture = buildWith(fake);
		const c = fixture.componentInstance;

		c.onUpload({ files: [] });
		c.onUpload({});
		c.onUpload(undefined);
		fixture.detectChanges();

		expect(c.images().length).toBe(0);
		expect(fake.calls.length).toBe(0);
	});
});
