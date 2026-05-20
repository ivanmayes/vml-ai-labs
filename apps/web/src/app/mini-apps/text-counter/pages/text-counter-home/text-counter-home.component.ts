import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../../shared/primeng.module';
import { TextCounterTextModeComponent } from '../../components/text-counter-text-mode/text-counter-text-mode.component';
import { TextCounterImageGeneralComponent } from '../../components/text-counter-image-general/text-counter-image-general.component';
import { TextCounterImageTemplateComponent } from '../../components/text-counter-image-template/text-counter-image-template.component';

type TextCounterTab = 'text' | 'image-general' | 'image-template';

@Component({
	selector: 'app-text-counter-home',
	standalone: true,
	templateUrl: './text-counter-home.component.html',
	styleUrls: ['./text-counter-home.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		PrimeNgModule,
		TextCounterTextModeComponent,
		TextCounterImageGeneralComponent,
		TextCounterImageTemplateComponent,
	],
})
export class TextCounterHomeComponent {
	// Image + template is the flagship experience — land users there by
	// default and lead with it in the tab strip.
	readonly activeTab = signal<TextCounterTab>('image-template');
}
