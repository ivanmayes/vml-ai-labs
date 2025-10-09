import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { SpaceUserService } from '../../../shared/services/space-user.service';
import { SpaceUser } from '../../../shared/models/space-user.model';
import { SpaceRole } from '../../../shared/models/space-role.enum';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { InviteUserDialogComponent } from './components/invite-user-dialog/invite-user-dialog.component';
import { ChangeRoleDialogComponent } from './components/change-role-dialog/change-role-dialog.component';

@Component({
	selector: 'app-users',
	templateUrl: './users.page.html',
	styleUrls: ['./users.page.scss'],
	standalone: false,
	providers: [ConfirmationService, MessageService]
})
export class UsersPage implements OnInit, OnDestroy {
	users: SpaceUser[] = [];
	loading: boolean = false;
	spaceId: string;
	currentSortField: string = 'createdAt';
	currentSortOrder: string = 'desc';
	currentSearchQuery: string = '';
	totalRecords: number = 0;
	currentPage: number = 1;
	rowsPerPage: number = 10;
	private searchSubject = new Subject<string>();
	Array = Array;

	constructor(
		private route: ActivatedRoute,
		private spaceUserService: SpaceUserService,
		private messageService: MessageService,
		private dialogService: DialogService,
		private confirmationService: ConfirmationService
	) {
		// Debounce search input by 400ms
		this.searchSubject.pipe(
			debounceTime(400),
			distinctUntilChanged()
		).subscribe(query => {
			this.currentSearchQuery = query;
			this.currentPage = 1;
			this.loadUsers();
		});
	}

	onSearch(event: Event): void {
		const query = (event.target as HTMLInputElement).value;
		this.searchSubject.next(query);
	}

	ngOnInit(): void {
		// Get space ID from route params (need to go up to the module route level)
		// Route hierarchy: /space/:id/admin → SpaceAdminPage (parent) → users (this component)
		this.route.parent?.parent?.params.subscribe(params => {
			this.spaceId = params['id'];
			if (this.spaceId) {
				this.loadUsers();
			}
		});
	}

	loadUsers(): void {
		if (!this.spaceId) {
			console.error('Cannot load users: spaceId is undefined');
			return;
		}

		this.loading = true;

		this.spaceUserService.getSpaceUsers(
			this.spaceId,
			this.currentSearchQuery,
			this.currentSortField,
			this.currentSortOrder,
			this.currentPage,
			this.rowsPerPage
		).subscribe({
			next: (response) => {
				this.users = response.data?.users || [];
				this.totalRecords = response.data?.total || 0;
				this.loading = false;
			},
			error: (error) => {
				console.error('Error loading space users:', error);
				this.messageService.add({
					severity: 'error',
					summary: 'Error',
					detail: 'Failed to load space users',
					life: 3000
				});
				this.loading = false;
			}
		});
	}

	onLazyLoad(event: any): void {
		// Handle pagination
		if (event.first !== undefined && event.rows !== undefined) {
			this.currentPage = Math.floor(event.first / event.rows) + 1;
			this.rowsPerPage = event.rows;
		}

		// Handle sorting
		if (event.sortField) {
			this.currentSortField = event.sortField;
			this.currentSortOrder = event.sortOrder === 1 ? 'asc' : 'desc';
		}

		this.loadUsers();
	}

	ngOnDestroy(): void {
		this.searchSubject.complete();
	}

	openInviteDialog(): void {
		const ref = this.dialogService.open(InviteUserDialogComponent, {
			header: 'Invite User to Space',
			width: '500px'
		});

		ref.onClose.subscribe((result) => {
			if (result) {
				this.spaceUserService.inviteUser(this.spaceId, result).subscribe({
					next: () => {
						this.loadUsers();
						this.messageService.add({
							severity: 'success',
							summary: 'Success',
							detail: 'User invited to space successfully',
							life: 3000
						});
					},
					error: (error) => {
						console.error('Error inviting user:', error);
						this.messageService.add({
							severity: 'error',
							summary: 'Error',
							detail: 'Failed to invite user to space',
							life: 3000
						});
					}
				});
			}
		});
	}

	openChangeRoleDialog(user: SpaceUser): void {
		const ref = this.dialogService.open(ChangeRoleDialogComponent, {
			header: 'Change User Role',
			width: '450px',
			data: {
				user: user
			}
		});

		ref.onClose.subscribe((result) => {
			if (result) {
				this.spaceUserService.updateUserRole(this.spaceId, user.userId, result).subscribe({
					next: () => {
						this.loadUsers();
						this.messageService.add({
							severity: 'success',
							summary: 'Success',
							detail: 'User role updated successfully',
							life: 3000
						});
					},
					error: (error) => {
						console.error('Error updating user role:', error);
						this.messageService.add({
							severity: 'error',
							summary: 'Error',
							detail: 'Failed to update user role',
							life: 3000
						});
					}
				});
			}
		});
	}

	onRemoveUser(user: SpaceUser): void {
		this.confirmationService.confirm({
			message: `Are you sure you want to remove ${user.user?.email || 'this user'} from this space?`,
			header: 'Confirm Remove',
			icon: 'pi pi-exclamation-triangle',
			accept: () => {
				this.spaceUserService.removeUser(this.spaceId, user.userId).subscribe({
					next: () => {
						this.loadUsers();
						this.messageService.add({
							severity: 'success',
							summary: 'Success',
							detail: 'User removed from space successfully',
							life: 3000
						});
					},
					error: (error) => {
						console.error('Error removing user from space:', error);
						this.messageService.add({
							severity: 'error',
							summary: 'Error',
							detail: 'Failed to remove user from space',
							life: 3000
						});
					}
				});
			}
		});
	}

	getRoleBadgeSeverity(role: SpaceRole): string {
		switch (role) {
			case SpaceRole.SpaceAdmin:
				return 'warn';
			case SpaceRole.SpaceUser:
				return 'secondary';
			default:
				return 'secondary';
		}
	}

	getRoleLabel(role: SpaceRole): string {
		switch (role) {
			case SpaceRole.SpaceAdmin:
				return 'Admin';
			case SpaceRole.SpaceUser:
				return 'User';
			default:
				return role;
		}
	}

	formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}
}
