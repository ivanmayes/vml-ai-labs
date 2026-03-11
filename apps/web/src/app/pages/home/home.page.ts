import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../shared/primeng.module';
import { ToolboxGridComponent } from '../../shared/components/toolbox-grid/toolbox-grid.component';

@Component({
	selector: 'app-home',
	standalone: true,
	templateUrl: './home.page.html',
	styleUrls: ['./home.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule, ToolboxGridComponent],
})
export class HomeComponent {}
