import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { GlobalQuery } from '../../state/global/global.query';
import { GlobalService } from '../../state/global/global.service';
import { SessionQuery } from '../../state/session/session.query';
import { SessionService } from '../../state/session/session.service';

import { LoginComponent } from './login.page';

describe('LoginComponent', () => {
	let component: LoginComponent;
	let fixture: ComponentFixture<LoginComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [LoginComponent],
			providers: [
				provideZonelessChangeDetection(),
				provideRouter([]),
				provideHttpClient(),
				provideHttpClientTesting(),
				provideAnimations(),
				MessageService,
				{
					provide: GlobalQuery,
					useValue: {
						select: () => of({}),
						settings: signal({}),
					},
				},
				{
					provide: GlobalService,
					useValue: {
						showHeader: () => {},
						hideHeader: () => {},
						getPublic: () => of({}),
						setTitle: () => {},
					},
				},
				{
					provide: SessionQuery,
					useValue: {
						selectLoading: () => of(false),
						loading: signal(false),
						getValue: () => ({ initialUrl: '', user: null }),
					},
				},
				{
					provide: SessionService,
					useValue: {
						login: () => of({}),
						setLoading: () => {},
					},
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(LoginComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
