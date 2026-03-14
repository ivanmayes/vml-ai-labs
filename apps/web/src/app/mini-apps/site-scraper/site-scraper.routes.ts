import { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./pages/site-scraper-home/site-scraper-home.component').then(
				(m) => m.SiteScraperHomeComponent,
			),
	},
	{
		path: ':id',
		loadComponent: () =>
			import('./pages/site-scraper-job/site-scraper-job.component').then(
				(m) => m.SiteScraperJobComponent,
			),
	},
];
