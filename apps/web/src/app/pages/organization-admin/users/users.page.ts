import { Component, OnInit, OnDestroy } from '@angular/core';
import { MessageService, ConfirmationService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { SessionQuery } from '../../../state/session/session.query';
import { OrganizationAdminService } from '../../../shared/services/organization-admin.service';
import { InviteUserDialogComponent } from './components/invite-user-dialog/invite-user-dialog.component';
import { PromoteUserDialogComponent } from './components/promote-user-dialog/promote-user-dialog.component';
import { environment } from '../../../../environments/environment';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
	standalone: false,
	selector: 'app-users',
	templateUrl: './users.page.html',
	styleUrls: ['./users.page.scss'],

	providers: [ConfirmationService],
})
export class UsersPage implements OnInit, OnDestroy {
	users: any[] = [];
	loading = false;
	currentUser: any;
	organizationId!: string;
	currentSortField = 'email';
	currentSortOrder = 'asc';
	currentSearchQuery = '';
	private searchSubject = new Subject<string>();
	Array = Array;

	constructor(
		private readonly adminService: OrganizationAdminService,
		private readonly sessionQuery: SessionQuery,
		private readonly messageService: MessageService,
		private readonly dialogService: DialogService,
		private readonly confirmationService: ConfirmationService,
	) {
		// Debounce search input by 400ms
		this.searchSubject
			.pipe(debounceTime(400), distinctUntilChanged())
			.subscribe((query) => {
				this.currentSearchQuery = query;
				this.loadUsers(query);
			});
	}

	ngOnInit(): void {
		this.currentUser = this.sessionQuery.getValue().user;
		this.organizationId = environment.organizationId;

		if (this.organizationId) {
			this.loadUsers();
		}
	}

	loadUsers(
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

		this.adminService
			.getUsers(this.organizationId, field, order, query)
			.subscribe({
				next: (response) => {
					this.users = response.data || [];
					this.loading = false;
				},
				error: (error) => {
					console.error('Error loading users:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load users',
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
		this.loadUsers(
			this.currentSearchQuery,
			this.currentSortField,
			this.currentSortOrder,
		);
	}

	openInviteDialog(): void {
		const ref = this.dialogService.open(InviteUserDialogComponent, {
			header: 'Invite User',
			width: '500px',
			data: {
				currentUserRole: this.currentUser.role,
				organizationId: this.organizationId,
			},
		});

		ref?.onClose.subscribe((result) => {
			if (result) {
				this.loadUsers();
				this.messageService.add({
					severity: 'success',
					summary: 'Success',
					detail: 'User invited successfully',
					life: 3000,
				});
			}
		});
	}

	openPromoteDialog(user: any): void {
		const ref = this.dialogService.open(PromoteUserDialogComponent, {
			header: 'Change User Role',
			width: '500px',
			data: {
				user,
				currentUserRole: this.currentUser.role,
				organizationId: this.organizationId,
			},
		});

		ref?.onClose.subscribe((result) => {
			if (result) {
				this.loadUsers();
				this.messageService.add({
					severity: 'success',
					summary: 'Success',
					detail: 'User role updated successfully',
					life: 3000,
				});
			}
		});
	}

	banUser(user: any): void {
		const action = user.deactivated ? 'unban' : 'ban';
		const message = user.deactivated
			? `Are you sure you want to unban ${user.email}?`
			: `Are you sure you want to ban ${user.email}?`;

		this.confirmationService.confirm({
			message,
			header: 'Confirm',
			icon: 'pi pi-exclamation-triangle',
			accept: () => {
				this.adminService
					.banUser(this.organizationId, {
						userId: user.id,
						banned: !user.deactivated,
					})
					.subscribe({
						next: () => {
							this.loadUsers();
							this.messageService.add({
								severity: 'success',
								summary: 'Success',
								detail: `User ${action}ned successfully`,
								life: 3000,
							});
						},
						error: (error) => {
							console.error('Error updating user status:', error);
							this.messageService.add({
								severity: 'error',
								summary: 'Error',
								detail: `Failed to ${action} user`,
								life: 3000,
							});
						},
					});
			},
		});
	}

	canManageUser(user: any): boolean {
		if (!this.currentUser || this.currentUser.id === user.id) {
			return false;
		}

		const roleHierarchy: any = {
			guest: 0,
			analyst: 1,
			reviewer: 2,
			manager: 3,
			admin: 4,
			'super-admin': 5,
		};

		const currentUserLevel = roleHierarchy[this.currentUser.role] || 0;
		const targetUserLevel = roleHierarchy[user.role] || 0;

		return currentUserLevel >= targetUserLevel;
	}

	getRoleBadgeSeverity(
		role: string,
	): 'info' | 'danger' | 'warn' | 'secondary' | 'success' | 'contrast' {
		switch (role) {
			case 'super-admin':
				return 'danger';
			case 'admin':
				return 'warn';
			case 'manager':
				return 'info';
			default:
				return 'secondary';
		}
	}

	getStatusBadgeSeverity(
		deactivated: boolean,
	): 'info' | 'danger' | 'warn' | 'secondary' | 'success' | 'contrast' {
		return deactivated ? 'danger' : 'success';
	}

	getStatusLabel(deactivated: boolean): string {
		return deactivated ? 'Banned' : 'Active';
	}
}
