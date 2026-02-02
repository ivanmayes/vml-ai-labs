import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { SpaceService } from '../../../shared/services/space.service';
import { Space } from '../../../shared/models/space.model';
import { environment } from '../../../../environments/environment';

import { SpaceFormDialogComponent } from './components/space-form-dialog/space-form-dialog.component';

@Component({
	selector: 'app-spaces',
	templateUrl: './spaces.page.html',
	styleUrls: ['./spaces.page.scss'],

	providers: [ConfirmationService],
})
export class SpacesPage implements OnInit, OnDestroy {
	spaces: Space[] = [];
	loading = false;
	organizationId!: string;
	currentSortField = 'created';
	currentSortOrder = 'desc';
	currentSearchQuery = '';
	private searchSubject = new Subject<string>();
	Array = Array;

	constructor(
		private readonly spaceService: SpaceService,
		private readonly messageService: MessageService,
		private readonly dialogService: DialogService,
		private readonly confirmationService: ConfirmationService,
		private readonly router: Router,
	) {
		// Debounce search input by 400ms
		this.searchSubject
			.pipe(debounceTime(400), distinctUntilChanged())
			.subscribe((query) => {
				this.currentSearchQuery = query;
				this.loadSpaces(query);
			});
	}

	ngOnInit(): void {
		this.organizationId = environment.organizationId;

		if (this.organizationId) {
			this.loadSpaces();
		}
	}

	loadSpaces(
		searchQuery?: string,
		sortField?: string,
		sortOrder?: string,
	): void {
		this.loading = true;

		// Use provided values or fall back to current state
		const query =
			searchQuery !== undefined ? searchQuery : this.currentSearchQuery;
		const field = sortField || this.currentSortField;
		const order = sortOrder || this.currentSortOrder;

		this.spaceService
			.getSpaces(this.organizationId, query, field, order)
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
						life: 3000,
					});
					this.loading = false;
				},
			});
	}

	onSearch(event: Event): void {
		const query = (event.target as HTMLInputElement).value;
		this.searchSubject.next(query);
	}

	ngOnDestroy(): void {
		this.searchSubject.complete();
	}

	onSort(event: any): void {
		this.currentSortField = event.field;
		this.currentSortOrder = event.order === 1 ? 'asc' : 'desc';
		this.loadSpaces(
			this.currentSearchQuery,
			this.currentSortField,
			this.currentSortOrder,
		);
	}

	openCreateDialog(): void {
		const ref = this.dialogService.open(SpaceFormDialogComponent, {
			header: 'Create Space',
			width: '500px',
			data: {
				mode: 'create',
				organizationId: this.organizationId,
			},
		});

		ref?.onClose.subscribe((result) => {
			if (result) {
				this.loadSpaces();
				this.messageService.add({
					severity: 'success',
					summary: 'Success',
					detail: 'Space created successfully',
					life: 3000,
				});
			}
		});
	}

	openEditDialog(space: Space): void {
		const ref = this.dialogService.open(SpaceFormDialogComponent, {
			header: 'Edit Space',
			width: '500px',
			data: {
				mode: 'edit',
				space,
				organizationId: this.organizationId,
			},
		});

		ref?.onClose.subscribe((result) => {
			if (result) {
				this.loadSpaces();
				this.messageService.add({
					severity: 'success',
					summary: 'Success',
					detail: 'Space updated successfully',
					life: 3000,
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
				this.spaceService
					.deleteSpace(this.organizationId, space.id)
					.subscribe({
						next: () => {
							this.loadSpaces();
							this.messageService.add({
								severity: 'success',
								summary: 'Success',
								detail: 'Space deleted successfully',
								life: 3000,
							});
						},
						error: (error) => {
							console.error('Error deleting space:', error);
							this.messageService.add({
								severity: 'error',
								summary: 'Error',
								detail: 'Failed to delete space',
								life: 3000,
							});
						},
					});
			},
		});
	}

	formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}

	navigateToSpaceAdmin(spaceId: string): void {
		this.router.navigate(['/space', spaceId, 'admin']);
	}
}
