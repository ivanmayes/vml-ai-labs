import { Routes } from '@angular/router';

import { appAccessGuard } from '../../shared/guards/app-access.guard';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./project-list/project-list.component').then(
				(m) => m.ProjectListComponent,
			),
	},
	{
		path: ':projectId',
		children: [
			{
				path: '',
				loadComponent: () =>
					import('./project-detail/project-detail.component').then(
						(m) => m.ProjectDetailComponent,
					),
			},
			{
				path: 'apps',
				canActivateChild: [appAccessGuard],
				children: [
					{
						path: 'document-converter',
						loadChildren: () =>
							import('../../mini-apps/document-converter/document-converter.routes').then(
								(m) => m.routes,
							),
					},
					{
						path: 'wpp-open-agent-updater',
						loadChildren: () =>
							import('../../mini-apps/wpp-open-agent-updater/wpp-open-agent-updater.routes').then(
								(m) => m.routes,
							),
					},
					// MINIAPP_ROUTES_REF
				],
			},
		],
	},
];
