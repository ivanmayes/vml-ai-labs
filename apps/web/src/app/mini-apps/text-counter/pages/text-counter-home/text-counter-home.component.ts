import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	computed,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TextareaModule } from 'primeng/textarea';
import { InputNumberModule } from 'primeng/inputnumber';

import { PrimeNgModule } from '../../../../shared/primeng.module';
import type {
	TextCounterSettings,
	TextCounterTarget,
	WordRule,
	TargetUnit,
} from '../../models/text-counter.types';
import {
	DEFAULT_SETTINGS,
	loadSettings,
	resetSettings,
	saveSettings,
} from '../../services/text-counter-settings.util';
import { computeStats } from '../../services/text-counter.util';

interface SelectOption<T> {
	label: string;
	value: T;
}

@Component({
	selector: 'app-text-counter-home',
	standalone: true,
	templateUrl: './text-counter-home.component.html',
	styleUrls: ['./text-counter-home.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		PrimeNgModule,
		TextareaModule,
		InputNumberModule,
	],
})
export class TextCounterHomeComponent implements OnInit {
	readonly text = signal<string>('');
	readonly settings = signal<TextCounterSettings>({
		...DEFAULT_SETTINGS,
		target: { ...DEFAULT_SETTINGS.target },
	});

	readonly stats = computed(() => computeStats(this.text(), this.settings()));

	readonly wordRuleOptions: SelectOption<WordRule>[] = [
		{ label: 'Whitespace', value: 'whitespace' },
		{ label: 'Alphanumeric', value: 'alphanumeric' },
	];

	readonly targetUnitOptions: SelectOption<TargetUnit>[] = [
		{ label: 'Characters', value: 'characters' },
		{ label: 'Words', value: 'words' },
	];

	ngOnInit(): void {
		// Per R7: never load any text from storage. Only settings.
		this.settings.set(loadSettings());
	}

	onTextChange(value: string | null | undefined): void {
		this.text.set(value ?? '');
	}

	updateSetting<K extends keyof TextCounterSettings>(
		key: K,
		value: TextCounterSettings[K],
	): void {
		this.settings.update((s) => ({ ...s, [key]: value }));
		saveSettings(this.settings());
	}

	updateTarget<K extends keyof TextCounterTarget>(
		key: K,
		value: TextCounterTarget[K],
	): void {
		this.settings.update((s) => ({
			...s,
			target: { ...s.target, [key]: value },
		}));
		saveSettings(this.settings());
	}

	onReset(): void {
		this.settings.set(resetSettings());
	}

	isOverForUnit(unit: TargetUnit): boolean {
		const s = this.settings();
		return (
			s.target.enabled &&
			s.target.unit === unit &&
			this.stats().overTarget
		);
	}
}
