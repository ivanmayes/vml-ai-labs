import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';

import { PrimeNgModule } from '../../../shared/primeng.module';
import {
	ProjectService,
	PublicProject,
	ProjectCreateDto,
} from '../../../shared/services/project.service';
import { SpaceService } from '../../../shared/services/space.service';
import { Space } from '../../../shared/models/space.model';
import { environment } from '../../../../environments/environment';

@Component({
	selector: 'app-project-list',
	templateUrl: './project-list.component.html',
	styleUrls: ['./project-list.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule],
	providers: [MessageService],
})
export class ProjectListComponent implements OnInit {
	readonly projects = signal<PublicProject[]>([]);
	readonly loading = signal(true);
	readonly spaces = signal<Space[]>([]);
	showCreateDialog = false;

	newProject: Partial<ProjectCreateDto> & { name: string } = {
		name: '',
		spaceId: undefined,
		description: undefined,
	};

	constructor(
		private readonly router: Router,
		private readonly projectService: ProjectService,
		private readonly spaceService: SpaceService,
		private readonly messageService: MessageService,
	) {}

	ngOnInit(): void {
		this.loadProjects();
		this.loadSpaces();
	}

	loadProjects(): void {
		this.loading.set(true);
		this.projectService.findProjects().subscribe({
			next: (response) => {
				this.projects.set(response.results || []);
				this.loading.set(false);
			},
			error: () => {
				this.messageService.add({
					severity: 'error',
					summary: 'Error',
					detail: 'Failed to load projects',
					life: 3000,
				});
				this.loading.set(false);
			},
		});
	}

	private loadSpaces(): void {
		const orgId = environment.organizationId;
		if (!orgId) return;

		this.spaceService.getSpaces(orgId).subscribe({
			next: (response) => {
				this.spaces.set(response.data || []);
			},
			error: () => {
				// Spaces failed to load — the user won't be able to create projects
			},
		});
	}

	openCreateDialog(): void {
		const spaceList = this.spaces();
		this.newProject = {
			name: '',
			spaceId: spaceList.length === 1 ? spaceList[0].id : undefined,
			description: undefined,
		};
		this.showCreateDialog = true;
	}

	createProject(): void {
		if (!this.newProject.name.trim() || !this.newProject.spaceId) return;

		this.projectService
			.createProject(this.newProject as ProjectCreateDto)
			.subscribe({
				next: () => {
					this.showCreateDialog = false;
					this.messageService.add({
						severity: 'success',
						summary: 'Success',
						detail: 'Project created',
						life: 3000,
					});
					this.loadProjects();
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to create project',
						life: 3000,
					});
				},
			});
	}

	navigateToProject(project: PublicProject): void {
		this.router.navigate(['/projects', project.id]);
	}
}
