import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';

import {
	WppOpenAgentUpdaterService,
	WppOpenAgent,
} from '../../services/wpp-open-agent-updater.service';
import { WppOpenService } from '../../../../_core/services/wpp-open/wpp-open.service';

import { TaskFormComponent } from './task-form.component';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_OS_CONTEXT = {
	hierarchy: { azId: 'h-az' },
	project: { azId: 'p-az', id: 'savedProjectId000000', name: 'P' },
};

type Spy = jasmine.Spy;

function setup(
	opts: {
		taskIdParam?: string;
		getTaskResult?: ReturnType<typeof of>;
		listAgentsResult?: ReturnType<typeof of>;
		getAgentConfigImpl?: Spy;
	} = {},
) {
	const updaterService = {
		getTask: jasmine.createSpy('getTask').and.returnValue(
			opts.getTaskResult ??
				// `delay(0)` matches real HttpClient async timing — without it
				// `of(...)` emits synchronously inside ngOnInit, before
				// setupReactiveAgentReload has subscribed, and the reactive
				// reload misses the patchValue emission.
				of({
					id: 'task-id',
					name: 'Test',
					boxFolderId: 'box-id',
					wppOpenAgentId: 'savedAgentId00000000',
					wppOpenProjectId: 'savedProjectId000000',
					fileExtensions: ['pptx'],
					includeSubfolders: true,
					cadence: 'manual',
					status: 'active',
					lastRunAt: null,
					createdAt: '',
					updatedAt: '',
				}).pipe(delay(0)),
		),
		listAgents: jasmine.createSpy('listAgents').and.returnValue(
			opts.listAgentsResult ??
				of({
					agents: [
						{ id: 'savedAgentId00000000', name: 'Saved Agent' },
						{ id: 'agent-2', name: 'Agent 2' },
					] as WppOpenAgent[],
					resolvedProjectId: 'savedProjectId000000',
				}),
		),
		getAgentConfig:
			opts.getAgentConfigImpl ??
			jasmine
				.createSpy('getAgentConfig')
				.and.returnValue(of({ id: 'cfg', name: 'cfg', fileCount: 0 })),
		validateBoxFolder: jasmine
			.createSpy('validateBoxFolder')
			.and.returnValue(of({ name: 'Folder', fileCount: 1 })),
		updateTask: jasmine.createSpy('updateTask').and.returnValue(of({})),
		createTask: jasmine.createSpy('createTask').and.returnValue(of({})),
	};

	const wppOpenService = {
		context: FAKE_OS_CONTEXT,
		getAccessToken: jasmine
			.createSpy('getAccessToken')
			.and.resolveTo('tok' as unknown),
	};

	TestBed.configureTestingModule({
		imports: [TaskFormComponent],
		providers: [
			provideRouter([]),
			provideHttpClient(),
			provideHttpClientTesting(),
			provideNoopAnimations(),
			{ provide: WppOpenAgentUpdaterService, useValue: updaterService },
			{ provide: WppOpenService, useValue: wppOpenService },
			{
				provide: ActivatedRoute,
				useValue: {
					snapshot: {
						paramMap: {
							get: (key: string) =>
								key === 'taskId'
									? (opts.taskIdParam ?? null)
									: null,
						},
					},
				},
			},
		],
	});

	const fixture = TestBed.createComponent(TaskFormComponent);
	return { fixture, component: fixture.componentInstance, updaterService };
}

// Real timers + microtask drain. jasmine.clock under zoneless mode + rxjs
// asyncScheduler + awaited Promises inside async methods is too brittle —
// real timers are slower (a few hundred ms per test) but deterministic.
async function advance(ms: number): Promise<void> {
	if (ms > 0) await new Promise((r) => setTimeout(r, ms));
	for (let i = 0; i < 8; i++) await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Race in validateAgentPair
// ---------------------------------------------------------------------------

describe('TaskFormComponent — agent-pick validation race', () => {
	it('drops the response from a stale validation call when a newer pick has fired', async () => {
		// First pick succeeds slowly, second pick fails fast with the typed
		// mismatch. Without the sequence guard, the success from pick #1
		// (arriving last) would clear the mismatch banner that pick #2 set.
		const slowSuccess = new Subject<{
			id: string;
			name: string;
			fileCount: number;
		}>();
		const fastMismatch = throwError(() => ({
			status: 400,
			error: {
				code: 'ACCESS_LAYER_AGENT_CONFIG_DOES_NOT_BELONG_TO_PROJECT',
			},
		}));

		// Create-mode setup (no taskIdParam) → no initial loadTask call,
		// no auto-validation consumes a spy returnValue. We control the
		// order ourselves via manual form patches.
		const getAgentConfigImpl = jasmine
			.createSpy('getAgentConfig')
			.and.returnValues(slowSuccess.asObservable(), fastMismatch);

		const { fixture, component } = setup({ getAgentConfigImpl });
		fixture.detectChanges(); // ngOnInit (create mode — autoPopulate sets project from osContext)

		// Project gets prefilled from osContext. Wait for the reactive-reload
		// debounce to settle so it doesn't interfere with our agent picks.
		await advance(500);

		// Pick A — slow response.
		component.form.patchValue({ wppOpenAgentId: 'agent-A' });
		await advance(300); // validation debounce → calls getAgentConfig (slow)
		await advance(0); // let async getToken() settle

		// Pick B — fast mismatch.
		component.form.patchValue({ wppOpenAgentId: 'agent-B' });
		await advance(300);
		await advance(0);

		// Pick #2's response has resolved with the mismatch.
		expect(component.agentMismatch()).toBe(true);

		// Pick #1's slow response now arrives — it should be dropped because
		// validateSeq has advanced past 1.
		slowSuccess.next({ id: 'cfg', name: 'cfg', fileCount: 0 });
		slowSuccess.complete();
		await advance(0);

		expect(component.agentMismatch()).toBe(true);
	});

	it('updates agentMismatch deterministically when only one validation is in flight', async () => {
		const getAgentConfigImpl = jasmine
			.createSpy('getAgentConfig')
			.and.returnValues(
				throwError(() => ({
					status: 400,
					error: {
						code: 'ACCESS_LAYER_AGENT_CONFIG_DOES_NOT_BELONG_TO_PROJECT',
					},
				})),
				of({ id: 'c', name: 'c', fileCount: 0 }),
			);

		const { fixture, component } = setup({ getAgentConfigImpl });
		fixture.detectChanges();
		await advance(500);

		component.form.patchValue({ wppOpenAgentId: 'agent-A' });
		await advance(300);
		await advance(0);
		expect(component.agentMismatch()).toBe(true);

		component.form.patchValue({ wppOpenAgentId: 'agent-B' });
		await advance(300);
		await advance(0);
		expect(component.agentMismatch()).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Suppress-agent-clear on initial Edit load
// ---------------------------------------------------------------------------

describe('TaskFormComponent — saved agent persists across Edit load', () => {
	it('does NOT wipe wppOpenAgentId when patchValue from loadTask triggers reactive reload', async () => {
		const { fixture, component, updaterService } = setup({
			taskIdParam: 'task-id',
		});
		fixture.detectChanges(); // ngOnInit → loadTask

		await advance(100); // getTask resolves, patchValue fires
		await advance(500); // reactive-reload debounce window — saved agent
		// must survive this with the suppress-clear flag.

		expect(component.form.get('wppOpenAgentId')!.value).toBe(
			'savedAgentId00000000',
		);
		expect(updaterService.listAgents).toHaveBeenCalled();
	});

	it('clears wppOpenAgentId on a SUBSEQUENT user-initiated project change', async () => {
		const { fixture, component } = setup({ taskIdParam: 'task-id' });
		fixture.detectChanges();
		await advance(100);
		await advance(500); // initial load — suppression flag consumed

		component.form.patchValue({ wppOpenProjectId: 'differentProjectId01' });
		await advance(500); // reactive reload debounce

		expect(component.form.get('wppOpenAgentId')!.value).toBe('');
	});
});
