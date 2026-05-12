import { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./pages/image-library-home/image-library-home.component').then(
				(m) => m.ImageLibraryHomeComponent,
			),
	},
	{
		path: ':spaceId',
		loadComponent: () =>
			import('./pages/image-library-home/image-library-home.component').then(
				(m) => m.ImageLibraryHomeComponent,
			),
	},
];
