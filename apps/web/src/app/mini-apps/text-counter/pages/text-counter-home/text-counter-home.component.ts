import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../../shared/primeng.module';
import { TextCounterTextModeComponent } from '../../components/text-counter-text-mode/text-counter-text-mode.component';

type TextCounterTab = 'text' | 'image-general' | 'image-template';

@Component({
	selector: 'app-text-counter-home',
	standalone: true,
	templateUrl: './text-counter-home.component.html',
	styleUrls: ['./text-counter-home.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule, TextCounterTextModeComponent],
})
export class TextCounterHomeComponent {
	// Default landing on the paste-text experience preserves prior behavior.
	// Image (general) is filled in by U6; Image + template by U9.
	readonly activeTab = signal<TextCounterTab>('text');
}
