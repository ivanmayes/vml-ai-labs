import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import type { Template } from '../../models/template.types';

import { TextCounterTemplatePickerComponent } from './text-counter-template-picker.component';

function makeTemplate(overrides: Partial<Template> = {}): Template {
	return {
		id: overrides.id ?? 'tpl-1',
		organizationId: overrides.organizationId ?? 'org-1',
		createdById: overrides.createdById ?? 'user-1',
		name: overrides.name ?? 'Holiday Carousel',
		createdAt: '2026-05-18T00:00:00.000Z',
		updatedAt: '2026-05-18T00:00:00.000Z',
		fields: overrides.fields ?? [],
	};
}

function makeFixture(initial: {
	templates: Template[];
	selectedId?: string | null;
}): ComponentFixture<TextCounterTemplatePickerComponent> {
	TestBed.configureTestingModule({
		imports: [TextCounterTemplatePickerComponent],
		providers: [provideNoopAnimations()],
	});
	const fixture = TestBed.createComponent(TextCounterTemplatePickerComponent);
	fixture.componentRef.setInput('templates', initial.templates);
	fixture.componentRef.setInput('selectedId', initial.selectedId ?? null);
	fixture.componentRef.setInput('orgId', 'org-1');
	fixture.detectChanges();
	return fixture;
}

describe('TextCounterTemplatePickerComponent', () => {
	it('renders the empty state and a "Create your first" button when templates is empty (M4)', () => {
		const fixture = makeFixture({ templates: [] });
		const empty = fixture.nativeElement.querySelector(
			'.template-picker-empty',
		);
		expect(empty).not.toBeNull();
		expect((empty as HTMLElement).textContent).toContain(
			'No templates yet',
		);

		const select = fixture.nativeElement.querySelector('p-select');
		expect(select).toBeNull();
	});

	it('emits manageTemplatesClicked when the empty-state button is clicked', () => {
		const fixture = makeFixture({ templates: [] });
		const c = fixture.componentInstance;

		const events: number[] = [];
		c.manageTemplatesClicked.subscribe(() => events.push(1));

		c.onManageTemplates();
		expect(events.length).toBe(1);
	});

	it('renders a p-select and a New template button when templates exist', () => {
		const fixture = makeFixture({
			templates: [makeTemplate({ id: 'tpl-1', name: 'A' })],
		});
		const select = fixture.nativeElement.querySelector('p-select');
		expect(select).not.toBeNull();
		// The "Create another template" affordance is the New template button.
		expect(fixture.nativeElement.textContent).toContain('New template');
	});

	it('exposes an option per template via the options computed', () => {
		const fixture = makeFixture({
			templates: [
				makeTemplate({ id: 'tpl-1', name: 'A' }),
				makeTemplate({ id: 'tpl-2', name: 'B' }),
			],
		});
		const opts = fixture.componentInstance.options();
		expect(opts).toEqual([
			{ label: 'A', value: 'tpl-1' },
			{ label: 'B', value: 'tpl-2' },
		]);
	});

	it('emits selectedIdChange when the select value changes', () => {
		const fixture = makeFixture({
			templates: [makeTemplate({ id: 'tpl-1', name: 'A' })],
		});
		const c = fixture.componentInstance;

		const received: (string | null)[] = [];
		c.selectedIdChange.subscribe((v) => received.push(v));

		c.onSelectChange('tpl-1');
		c.onSelectChange(null);
		c.onSelectChange(undefined);

		expect(received).toEqual(['tpl-1', null, null]);
	});

	it('hasTemplates is true when the templates list is non-empty', () => {
		const full = makeFixture({ templates: [makeTemplate()] });
		expect(full.componentInstance.hasTemplates()).toBe(true);
	});

	it('hasTemplates is false when the templates list is empty', () => {
		const empty = makeFixture({ templates: [] });
		expect(empty.componentInstance.hasTemplates()).toBe(false);
	});
});
