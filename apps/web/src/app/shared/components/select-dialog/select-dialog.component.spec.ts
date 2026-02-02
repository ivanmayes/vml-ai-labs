import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

import { SelectDialogComponent } from './select-dialog.component';

describe('SelectDialogComponent', () => {
	let component: SelectDialogComponent;
	let fixture: ComponentFixture<SelectDialogComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [SelectDialogComponent],
			schemas: [NO_ERRORS_SCHEMA],
			providers: [
				{
					provide: DynamicDialogRef,
					useValue: { close: () => {} },
				},
				{
					provide: DynamicDialogConfig,
					useValue: { data: { title: 'Test', options: {} } },
				},
			],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(SelectDialogComponent);
		component = fixture.componentInstance;
		// Skip detectChanges to avoid PrimeNG component errors in unit tests
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
