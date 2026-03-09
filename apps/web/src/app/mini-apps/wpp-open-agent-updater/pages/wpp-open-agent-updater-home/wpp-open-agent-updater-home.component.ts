import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

@Component({
	selector: 'app-wpp-open-agent-updater-home',
	standalone: true,
	imports: [CommonModule, CardModule],
	template: `
		<p-card header="WPP Open Agent Updater">
			<p>Welcome to the WPP Open Agent Updater app.</p>
		</p-card>
	`,
})
export class WppOpenAgentUpdaterHomeComponent {}
