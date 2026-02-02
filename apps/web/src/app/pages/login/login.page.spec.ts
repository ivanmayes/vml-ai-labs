import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { of } from 'rxjs';

import { GlobalQuery } from '../../state/global/global.query';
import { GlobalService } from '../../state/global/global.service';
import { SessionQuery } from '../../state/session/session.query';
import { SessionService } from '../../state/session/session.service';

import { LoginComponent } from './login.page';

describe('LoginComponent', () => {
	let component: LoginComponent;
	let fixture: ComponentFixture<LoginComponent>;

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			declarations: [LoginComponent],
			imports: [CommonModule],
			schemas: [NO_ERRORS_SCHEMA],
			providers: [
				provideRouter([]),
				provideHttpClient(),
				provideHttpClientTesting(),
				provideAnimations(),
				{
					provide: GlobalQuery,
					useValue: { select: () => of({}) },
				},
				{
					provide: GlobalService,
					useValue: {
						showHeader: () => {},
						hideHeader: () => {},
					},
				},
				{
					provide: SessionQuery,
					useValue: { selectLoading: () => of(false) },
				},
				{
					provide: SessionService,
					useValue: { login: () => of({}) },
				},
			],
		}).compileComponents();
	}));

	beforeEach(() => {
		fixture = TestBed.createComponent(LoginComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
