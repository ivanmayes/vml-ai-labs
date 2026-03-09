import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { GlobalQuery } from '../../../state/global/global.query';
import { SessionQuery } from '../../../state/session/session.query';
import { SessionService } from '../../../state/session/session.service';

import { BasicAuthComponent } from './basic.component';

describe('BasicAuthComponent', () => {
	let component: BasicAuthComponent;
	let fixture: ComponentFixture<BasicAuthComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [BasicAuthComponent],
			providers: [
				provideZonelessChangeDetection(),
				provideHttpClient(),
				provideHttpClientTesting(),
				provideAnimations(),
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
						selectLoading: () => of(false),
						loading: signal(false),
					},
				},
				{
					provide: SessionService,
					useValue: { activateEmail: () => of({}) },
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(BasicAuthComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('email', 'test@example.com');
		fixture.componentRef.setInput('authConfig', { data: {} });
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
