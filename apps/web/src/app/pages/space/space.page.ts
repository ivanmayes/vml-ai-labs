import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';

import { SpaceService } from '../../shared/services/space.service';
import { Space } from '../../shared/models/space.model';
import { PrimeNgModule } from '../../shared/primeng.module';

@Component({
	selector: 'app-space',
	templateUrl: './space.page.html',
	styleUrls: ['./space.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
	providers: [MessageService],
})
export class SpacePage implements OnInit {
	spaceId!: string;
	space = signal<Space | null>(null);
	loading = signal(true);
	accessDenied = signal(false);

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
		this.loading.set(true);
		this.accessDenied.set(false);

		this.spaceService.getSpace(this.spaceId).subscribe({
			next: (response) => {
				this.space.set(response.data);
				this.loading.set(false);
			},
			error: (error) => {
				console.error('Error loading space:', error);

				if (error.status === 403) {
					this.accessDenied.set(true);
				} else {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: error.error?.message || 'Failed to load space',
						life: 3000,
					});
				}

				this.loading.set(false);
			},
		});
	}
}
