import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';

import { SpaceService } from '../../shared/services/space.service';
import { Space } from '../../shared/models/space.model';
import { environment } from '../../../environments/environment';

@Component({
	selector: 'app-space',

	templateUrl: './space.page.html',
	styleUrls: ['./space.page.scss'],
	providers: [MessageService],
})
export class SpacePage implements OnInit {
	spaceId!: string;
	space: Space | null = null;
	loading = true;
	organizationId: string = environment.organizationId;
	accessDenied = false;

	constructor(
		private route: ActivatedRoute,
		private spaceService: SpaceService,
		private messageService: MessageService,
	) {}

	ngOnInit(): void {
		this.route.params.subscribe((params) => {
			this.spaceId = params['id'];
			if (this.spaceId) {
				this.loadSpace();
			}
		});
	}

	loadSpace(): void {
		this.loading = true;
		this.accessDenied = false;

		this.spaceService.getSpace(this.spaceId).subscribe({
			next: (response) => {
				this.space = response.data;
				this.loading = false;
			},
			error: (error) => {
				console.error('Error loading space:', error);

				if (error.status === 403) {
					this.accessDenied = true;
				} else {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: error.error?.message || 'Failed to load space',
						life: 3000,
					});
				}

				this.loading = false;
			},
		});
	}
}
