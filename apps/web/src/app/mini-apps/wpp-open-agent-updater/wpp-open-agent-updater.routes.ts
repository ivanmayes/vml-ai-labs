import { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./pages/wpp-open-agent-updater-home/wpp-open-agent-updater-home.component').then(
				(m) => m.WppOpenAgentUpdaterHomeComponent,
			),
	},
];
