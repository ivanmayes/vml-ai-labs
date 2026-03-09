import { Routes } from '@angular/router';

import { AdminRoleGuard } from './shared/guards/admin-role.guard';
import { SpaceAdminGuard } from './shared/guards/space-admin.guard';
import { appAccessGuard } from './shared/guards/app-access.guard';

export const routes: Routes = [
	// Main Pages
	{
		path: 'home',
		loadChildren: () =>
			import('./pages/home/home.module').then((m) => m.HomePageModule),
	},
	{
		path: 'login',
		loadChildren: () =>
			import('./pages/login/login.module').then((m) => m.LoginPageModule),
	},
	{
		path: 'organization/admin',
		loadChildren: () =>
			import('./pages/organization-admin/organization-admin.module').then(
				(m) => m.OrganizationAdminModule,
			),
		canActivate: [AdminRoleGuard],
	},
	{
		path: 'space/:id/admin',
		loadChildren: () =>
			import('./pages/space-admin/space-admin.module').then(
				(m) => m.SpaceAdminPageModule,
			),
		canActivate: [SpaceAdminGuard],
	},
	{
		path: 'space/:id',
		loadChildren: () =>
			import('./pages/space/space.module').then((m) => m.SpacePageModule),
	},
	{
		path: 'dashboard',
		loadChildren: () =>
			import('./pages/dashboard/dashboard.module').then(
				(m) => m.DashboardModule,
			),
	},
	{
		path: 'space/:spaceId/project/:projectId',
		loadChildren: () =>
			import('./pages/project/project.module').then(
				(m) => m.ProjectModule,
			),
	},
	{
		path: 'sso/okta/:orgId/login',
		loadChildren: () =>
			import('./pages/login/login.module').then((m) => m.LoginPageModule),
		data: {
			oktaCallback: true,
		},
	},
	{
		path: 'sso/saml/:orgId/login/:authChallenge',
		loadChildren: () =>
			import('./pages/login/login.module').then((m) => m.LoginPageModule),
		data: {
			samlCallback: true,
		},
	},

	// Mini Apps
	{
		path: 'apps',
		canActivateChild: [appAccessGuard],
		children: [
			{
				path: 'document-converter',
				loadChildren: () =>
					import('./mini-apps/document-converter/document-converter.routes').then(
						(m) => m.routes,
					),
			},
			{
				path: 'wpp-open-agent-updater',
				loadChildren: () =>
					import('./mini-apps/wpp-open-agent-updater/wpp-open-agent-updater.routes').then(
						(m) => m.routes,
					),
			},
			// MINIAPP_ROUTES_REF
		],
	},

	// Wildcards
	{ path: '', redirectTo: 'home', pathMatch: 'full' },
	{ path: '**', redirectTo: 'home', pathMatch: 'full' },
];
