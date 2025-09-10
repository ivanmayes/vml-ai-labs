import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
	// Main Pages
	{ path: 'home', loadChildren: () => import('./pages/home/home.module').then(m => m.HomePageModule) },
	{ path: 'login', loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule) },
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
