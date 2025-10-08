import { Component, OnInit } from '@angular/core';
import { MessageService, ConfirmationService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { SessionQuery } from '../../../state/session/session.query';
import { SpaceService } from '../../../shared/services/space.service';
import { Space } from '../../../shared/models/space.model';
import { SpaceFormDialogComponent } from './components/space-form-dialog/space-form-dialog.component';
import { environment } from '../../../../environments/environment';

@Component({
	selector: 'app-spaces',
	templateUrl: './spaces.page.html',
	styleUrls: ['./spaces.page.scss'],
	standalone: false,
	providers: [ConfirmationService]
})
export class SpacesPage implements OnInit {
	spaces: Space[] = [];
	loading: boolean = false;
	organizationId: string;

	constructor(
		private readonly spaceService: SpaceService,
		private readonly sessionQuery: SessionQuery,
		private readonly messageService: MessageService,
		private readonly dialogService: DialogService,
		private readonly confirmationService: ConfirmationService
	) {}

	ngOnInit(): void {
		this.organizationId = environment.organizationId;

		if (this.organizationId) {
			this.loadSpaces();
		}
	}

	loadSpaces(searchQuery?: string): void {
		this.loading = true;
		this.spaceService.getSpaces(this.organizationId, searchQuery)
			.subscribe({
				next: (response) => {
					this.spaces = response.data || [];
					this.loading = false;
				},
				error: (error) => {
					console.error('Error loading spaces:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load spaces',
						life: 3000
					});
					this.loading = false;
				}
			});
	}

	onSearch(event: Event): void {
		const query = (event.target as HTMLInputElement).value;
		this.loadSpaces(query);
	}

	openCreateDialog(): void {
		const ref: DynamicDialogRef = this.dialogService.open(SpaceFormDialogComponent, {
			header: 'Create Space',
			width: '500px',
			data: {
				mode: 'create',
				organizationId: this.organizationId
			}
		});

		ref.onClose.subscribe((result) => {
			if (result) {
				this.loadSpaces();
				this.messageService.add({
					severity: 'success',
					summary: 'Success',
					detail: 'Space created successfully',
					life: 3000
				});
			}
		});
	}

	openEditDialog(space: Space): void {
		const ref: DynamicDialogRef = this.dialogService.open(SpaceFormDialogComponent, {
			header: 'Edit Space',
			width: '500px',
			data: {
				mode: 'edit',
				space,
				organizationId: this.organizationId
			}
		});

		ref.onClose.subscribe((result) => {
			if (result) {
				this.loadSpaces();
				this.messageService.add({
					severity: 'success',
					summary: 'Success',
					detail: 'Space updated successfully',
					life: 3000
				});
			}
		});
	}

	deleteSpace(space: Space): void {
		this.confirmationService.confirm({
			message: `Are you sure you want to delete the space "${space.name}"? This action cannot be undone.`,
			header: 'Confirm Delete',
			icon: 'pi pi-exclamation-triangle',
			accept: () => {
				this.spaceService.deleteSpace(this.organizationId, space.id)
					.subscribe({
						next: () => {
							this.loadSpaces();
							this.messageService.add({
								severity: 'success',
								summary: 'Success',
								detail: 'Space deleted successfully',
								life: 3000
							});
						},
						error: (error) => {
							console.error('Error deleting space:', error);
							this.messageService.add({
								severity: 'error',
								summary: 'Error',
								detail: 'Failed to delete space',
								life: 3000
							});
						}
					});
			}
		});
	}

	formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}
}
