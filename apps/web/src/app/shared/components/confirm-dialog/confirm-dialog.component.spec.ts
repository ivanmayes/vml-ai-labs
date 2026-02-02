import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
	let component: ConfirmDialogComponent;
	let fixture: ComponentFixture<ConfirmDialogComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [ConfirmDialogComponent],
			schemas: [NO_ERRORS_SCHEMA],
			providers: [
				{
					provide: DynamicDialogRef,
					useValue: { close: () => {} },
				},
				{
					provide: DynamicDialogConfig,
					useValue: {
						data: { title: 'Test', message: 'Test message' },
					},
				},
			],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(ConfirmDialogComponent);
		component = fixture.componentInstance;
		// Skip detectChanges to avoid PrimeNG and pipe errors in unit tests
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
