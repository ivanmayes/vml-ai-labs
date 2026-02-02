import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';

import { GlobalQuery } from '../../../../state/global/global.query';
import { SessionQuery } from '../../../../state/session/session.query';
import { SessionService } from '../../../../state/session/session.service';

import { NavigationBarComponent } from './navigation-bar.component';

describe('NavigationBarComponent', () => {
	let component: NavigationBarComponent;
	let fixture: ComponentFixture<NavigationBarComponent>;

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [NavigationBarComponent],
			schemas: [NO_ERRORS_SCHEMA],
			providers: [
				provideRouter([]),
				provideHttpClient(),
				provideHttpClientTesting(),
				{
					provide: GlobalQuery,
					useValue: { select: () => of({}) },
				},
				{
					provide: SessionQuery,
					useValue: { select: () => of({}) },
				},
				{
					provide: SessionService,
					useValue: { logout: () => {} },
				},
			],
		}).compileComponents();
	}));

	beforeEach(() => {
		fixture = TestBed.createComponent(NavigationBarComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
