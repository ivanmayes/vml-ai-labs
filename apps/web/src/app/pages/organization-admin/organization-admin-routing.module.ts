import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { OrganizationAdminPage } from './organization-admin.page';

const routes: Routes = [
	{
		path: '',
		component: OrganizationAdminPage,
		children: [
			{
				path: 'users',
				loadChildren: () => import('./users/users.module').then(m => m.UsersPageModule)
			},
			{
				path: 'spaces',
				loadChildren: () => import('./spaces/spaces.module').then(m => m.SpacesPageModule)
			},
			{
				path: '',
				redirectTo: 'users',
				pathMatch: 'full'
			}
		]
	}
];

@NgModule({
	imports: [RouterModule.forChild(routes)],
	exports: [RouterModule]
})
export class OrganizationAdminRoutingModule {}
