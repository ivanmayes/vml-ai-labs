import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { of } from 'rxjs';

import { GlobalQuery } from '../../../../state/global/global.query';
import { SessionQuery } from '../../../../state/session/session.query';
import { SessionService } from '../../../../state/session/session.service';

import { NavigationBarComponent } from './navigation-bar.component';

describe('NavigationBarComponent', () => {
	let component: NavigationBarComponent;
	let fixture: ComponentFixture<NavigationBarComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [NavigationBarComponent],
			providers: [
				provideZonelessChangeDetection(),
				provideRouter([]),
				provideHttpClient(),
				provideHttpClientTesting(),
				{
					provide: GlobalQuery,
					useValue: {
						select: () => of({}),
						settings: signal({}),
					},
				},
				{
					provide: SessionQuery,
					useValue: {
						select: () => of({}),
						user: signal(null),
					},
				},
				{
					provide: SessionService,
					useValue: { logout: () => {} },
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(NavigationBarComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
