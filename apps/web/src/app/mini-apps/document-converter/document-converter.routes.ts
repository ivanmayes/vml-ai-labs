import { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./components/document-converter.component').then(
				(m) => m.DocumentConverterComponent,
			),
	},
];
