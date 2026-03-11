import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	computed,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';

import { PrimeNgModule } from '../../../shared/primeng.module';
import { ToolboxGridComponent } from '../../../shared/components/toolbox-grid/toolbox-grid.component';
import {
	ProjectService,
	PublicProject,
} from '../../../shared/services/project.service';

@Component({
	selector: 'app-project-detail',
	templateUrl: './project-detail.component.html',
	styleUrls: ['./project-detail.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, RouterLink, PrimeNgModule, ToolboxGridComponent],
	providers: [MessageService],
})
export class ProjectDetailComponent implements OnInit {
	readonly project = signal<PublicProject | null>(null);
	readonly loading = signal(true);
	readonly projectId = signal('');

	readonly baseRoute = computed(() => `/projects/${this.projectId()}`);

	constructor(
		private readonly route: ActivatedRoute,
		private readonly projectService: ProjectService,
		private readonly messageService: MessageService,
	) {}

	ngOnInit(): void {
		this.route.params.subscribe((params) => {
			const id = params['projectId'];
			if (id) {
				this.projectId.set(id);
				this.loadProject(id);
			}
		});
	}

	private loadProject(id: string): void {
		this.loading.set(true);
		this.projectService.getProject(id).subscribe({
			next: (project) => {
				this.project.set(project);
				this.loading.set(false);
			},
			error: () => {
				this.messageService.add({
					severity: 'error',
					summary: 'Error',
					detail: 'Failed to load project',
					life: 3000,
				});
				this.loading.set(false);
			},
		});
	}
}
