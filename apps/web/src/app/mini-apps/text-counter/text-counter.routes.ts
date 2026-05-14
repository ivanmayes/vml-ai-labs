import { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./pages/text-counter-home/text-counter-home.component').then(
				(m) => m.TextCounterHomeComponent,
			),
	},
];
