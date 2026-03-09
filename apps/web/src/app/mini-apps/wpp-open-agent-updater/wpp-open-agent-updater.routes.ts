import { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./components/task-list/task-list.component').then(
				(m) => m.TaskListComponent,
			),
	},
	{
		path: 'new',
		loadComponent: () =>
			import('./components/task-form/task-form.component').then(
				(m) => m.TaskFormComponent,
			),
	},
	{
		path: ':taskId',
		loadComponent: () =>
			import('./components/task-detail/task-detail.component').then(
				(m) => m.TaskDetailComponent,
			),
	},
	{
		path: ':taskId/edit',
		loadComponent: () =>
			import('./components/task-form/task-form.component').then(
				(m) => m.TaskFormComponent,
			),
	},
	{
		path: 'runs/:runId',
		loadComponent: () =>
			import('./components/run-detail/run-detail.component').then(
				(m) => m.RunDetailComponent,
			),
	},
];
