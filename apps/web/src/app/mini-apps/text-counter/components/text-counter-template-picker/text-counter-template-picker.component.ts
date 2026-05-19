/**
 * Template picker for the image + template tab.
 *
 * Two display modes driven by the templates list:
 *
 *   - Empty list (M4 first-run): renders an inline empty state with a
 *     single "Create your first" button. Emits `manageTemplatesClicked`
 *     so the parent (orchestrator) can open the U8 dialog in `create`
 *     mode.
 *   - Non-empty: renders a `p-select` over the org's templates plus a
 *     "Manage templates" link that emits the same event. The select
 *     surfaces the current `selectedId` (or `null` for "Choose a
 *     template…").
 *
 * Selection is fully controlled — the parent owns `selectedId` and
 * receives changes via the `selectedIdChange` output. We intentionally
 * keep this component stateless so the orchestrator can reset it across
 * card lifecycles without prop drilling.
 */
import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { PrimeNgModule } from '../../../../shared/primeng.module';
import type { Template } from '../../models/template.types';

interface TemplateOption {
	label: string;
	value: string;
}

@Component({
	selector: 'app-text-counter-template-picker',
	standalone: true,
	templateUrl: './text-counter-template-picker.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule],
})
export class TextCounterTemplatePickerComponent {
	readonly templates = input.required<Template[]>();
	readonly selectedId = input<string | null>(null);
	readonly orgId = input<string>('');
	readonly disabled = input<boolean>(false);

	readonly selectedIdChange = output<string | null>();
	readonly manageTemplatesClicked = output<void>();
	readonly editSelectedTemplateClicked = output<void>();

	/**
	 * Plain `{ label, value }` shape consumed by `p-select`. The label is
	 * the template name; the value is the template id.
	 */
	readonly options = computed<TemplateOption[]>(() =>
		this.templates().map((t) => ({ label: t.name, value: t.id })),
	);

	readonly hasTemplates = computed(() => this.templates().length > 0);

	readonly hasSelection = computed(() => !!this.selectedId());

	onSelectChange(value: string | null | undefined): void {
		this.selectedIdChange.emit(value ?? null);
	}

	onManageTemplates(): void {
		this.manageTemplatesClicked.emit();
	}

	onEditSelected(): void {
		this.editSelectedTemplateClicked.emit();
	}
}
