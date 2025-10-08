import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SpaceAdminPage } from './space-admin.page';

const routes: Routes = [
	{
		path: '',
		component: SpaceAdminPage,
		children: [
			{
				path: 'settings',
				loadChildren: () => import('./settings/settings.module').then(m => m.SettingsPageModule)
			},
			{
				path: 'users',
				loadChildren: () => import('./users/users.module').then(m => m.UsersPageModule)
			},
			{
				path: '',
				redirectTo: 'settings',
				pathMatch: 'full'
			}
		]
	}
];

@NgModule({
	imports: [RouterModule.forChild(routes)],
	exports: [RouterModule]
})
export class SpaceAdminRoutingModule {}
