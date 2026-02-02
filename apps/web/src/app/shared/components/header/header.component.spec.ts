import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { RouterQuery } from '@datorama/akita-ng-router-store';

import { GlobalQuery } from '../../../state/global/global.query';
import { SessionQuery } from '../../../state/session/session.query';
import { SessionService } from '../../../state/session/session.service';
import { ThemeService } from '../../services/theme.service';

import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
	let component: HeaderComponent;
	let fixture: ComponentFixture<HeaderComponent>;

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [HeaderComponent],
			schemas: [NO_ERRORS_SCHEMA],
			providers: [
				provideRouter([]),
				provideHttpClient(),
				provideHttpClientTesting(),
				{
					provide: RouterQuery,
					useValue: { select: () => of({}) },
				},
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
				{
					provide: ThemeService,
					useValue: {
						currentTheme: 'light',
						toggleTheme: () => {},
						getTheme: () => 'light',
					},
				},
			],
		}).compileComponents();
	}));

	beforeEach(() => {
		fixture = TestBed.createComponent(HeaderComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
