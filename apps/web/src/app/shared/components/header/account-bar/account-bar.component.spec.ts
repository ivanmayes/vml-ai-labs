import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { of } from 'rxjs';

import { GlobalQuery } from '../../../../state/global/global.query';
import { SessionQuery } from '../../../../state/session/session.query';
import { SessionService } from '../../../../state/session/session.service';
import { ThemeService } from '../../../services/theme.service';

import { AccountBarComponent } from './account-bar.component';

describe('AccountBarComponent', () => {
	let component: AccountBarComponent;
	let fixture: ComponentFixture<AccountBarComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [AccountBarComponent],
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
						isAdmin: signal(false),
					},
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

		fixture = TestBed.createComponent(AccountBarComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
