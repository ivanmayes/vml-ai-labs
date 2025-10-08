import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AdminRoleGuard } from './shared/guards/admin-role.guard';

const routes: Routes = [
	// Main Pages
	{ path: 'home', loadChildren: () => import('./pages/home/home.module').then(m => m.HomePageModule) },
	{ path: 'login', loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule) },
	{
		path: 'organization/admin',
		loadChildren: () => import('./pages/organization-admin/organization-admin.module').then(m => m.OrganizationAdminModule),
		canActivate: [AdminRoleGuard]
	},
	{
		path: 'sso/okta/:orgId/login',
		loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule),
		data: {
			oktaCallback: true
		}
	},
	{
		path: 'sso/saml/:orgId/login/:authChallenge',
		loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule),
		data: {
			samlCallback: true
		}
	},

	// Wildcards
	{ path: '', redirectTo: 'home', pathMatch: 'full' },
	{ path: '*', redirectTo: 'home', pathMatch: 'full' }
];

@NgModule({
	imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
	exports: [RouterModule]
})
export class AppRoutingModule {}
