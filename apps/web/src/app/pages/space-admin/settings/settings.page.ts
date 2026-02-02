import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
	FormBuilder,
	FormGroup,
	FormsModule,
	ReactiveFormsModule,
	Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';

import { SpaceService } from '../../../shared/services/space.service';
import { Space } from '../../../shared/models/space.model';
import { environment } from '../../../../environments/environment';
import { PrimeNgModule } from '../../../shared/primeng.module';

@Component({
	selector: 'app-settings',
	templateUrl: './settings.page.html',
	styleUrls: ['./settings.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, ReactiveFormsModule, PrimeNgModule],
	providers: [MessageService],
})
export class SettingsPage implements OnInit {
	settingsForm: FormGroup;
	spaceId!: string;
	organizationId: string = environment.organizationId;
	loading = signal(false);
	saving = signal(false);
	tenantIds = signal<string[]>([]);
	newTenantId = signal('');

	constructor(
		private fb: FormBuilder,
		private route: ActivatedRoute,
		private spaceService: SpaceService,
		private messageService: MessageService,
	) {
		this.settingsForm = this.fb.group({
			name: ['', Validators.required],
			isPublic: [true],
			primaryColor: [
				'#000000',
				[Validators.pattern(/^#[0-9A-Fa-f]{6}$/)],
			],
		});

		// Listen to primaryColor changes to ensure # prefix
		this.settingsForm
			.get('primaryColor')
			?.valueChanges.subscribe((value) => {
				if (value && !value.startsWith('#')) {
					this.settingsForm.patchValue(
						{ primaryColor: '#' + value },
						{ emitEvent: false },
					);
				}
			});
	}

	onColorChange(color: string): void {
		// Ensure the color has a # prefix
		const colorValue = color.startsWith('#') ? color : '#' + color;
		this.settingsForm.patchValue({ primaryColor: colorValue });
		this.settingsForm.get('primaryColor')?.markAsDirty();
		this.settingsForm.get('primaryColor')?.markAsTouched();
	}

	ngOnInit(): void {
		// Get space ID from route params (need to go up to the module route level)
		// Route hierarchy: /space/:id/admin → SpaceAdminPage (parent) → settings (this component)
		this.route.parent?.parent?.params.subscribe((params) => {
			this.spaceId = params['id'];
			if (this.spaceId) {
				this.loadSpaceSettings();
			}
		});
	}

	loadSpaceSettings(): void {
		if (!this.spaceId) {
			console.error('Cannot load settings: spaceId is undefined');
			return;
		}

		this.loading.set(true);

		// For now, we'll use the regular getSpaces endpoint to get the space data
		// In production, you might want a dedicated getSpace(id) endpoint
		this.spaceService.getSpaces(this.organizationId).subscribe({
			next: (response) => {
				const space = response.data?.find(
					(s: Space) => s.id === this.spaceId,
				);
				if (space) {
					this.settingsForm.patchValue({
						name: space.name,
						isPublic:
							space.isPublic !== undefined
								? space.isPublic
								: true,
						primaryColor: space.settings?.primaryColor || '#000000',
					});
					this.tenantIds.set(
						(space as any).approvedWPPOpenTenantIds || [],
					);
					// Mark form as pristine after loading initial values
					this.settingsForm.markAsPristine();
				} else {
					console.error('Space not found in response');
					this.messageService.add({
						severity: 'warn',
						summary: 'Warning',
						detail: 'Could not find space settings',
						life: 3000,
					});
				}
				this.loading.set(false);
			},
			error: (error) => {
				console.error('Error loading space settings:', error);
				this.messageService.add({
					severity: 'error',
					summary: 'Error',
					detail: 'Failed to load space settings',
					life: 3000,
				});
				this.loading.set(false);
			},
		});
	}

	onSave(): void {
		if (this.settingsForm.invalid) {
			this.settingsForm.markAllAsTouched();
			return;
		}

		this.saving.set(true);
		const formValue = this.settingsForm.value;

		const updateDto = {
			name: formValue.name,
			isPublic: formValue.isPublic,
			settings: {
				primaryColor: formValue.primaryColor,
			},
			approvedWPPOpenTenantIds: this.tenantIds(),
		};

		this.spaceService
			.updateSettings(this.organizationId, this.spaceId, updateDto)
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Success',
						detail: 'Space settings updated successfully',
						life: 3000,
					});
					this.saving.set(false);
					// Mark form as pristine after successful save
					this.settingsForm.markAsPristine();
				},
				error: (error) => {
					console.error('Error updating space settings:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to update space settings',
						life: 3000,
					});
					this.saving.set(false);
				},
			});
	}

	addTenantId(): void {
		const currentNewId = this.newTenantId();
		if (currentNewId && currentNewId.trim()) {
			const trimmedId = currentNewId.trim();
			const currentIds = this.tenantIds();
			if (!currentIds.includes(trimmedId)) {
				this.tenantIds.set([...currentIds, trimmedId]);
				this.newTenantId.set('');
				this.settingsForm.markAsDirty();
			}
		}
	}

	removeTenantId(index: number): void {
		const currentIds = [...this.tenantIds()];
		currentIds.splice(index, 1);
		this.tenantIds.set(currentIds);
		this.settingsForm.markAsDirty();
	}

	// Helper for template two-way binding
	setNewTenantId(value: string): void {
		this.newTenantId.set(value);
	}
}
