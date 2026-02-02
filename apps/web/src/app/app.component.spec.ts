import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { DialogService } from 'primeng/dynamicdialog';
import { of } from 'rxjs';

import { AppComponent } from './app.component';
import { GlobalQuery } from './state/global/global.query';
import { GlobalService } from './state/global/global.service';
import { SessionQuery } from './state/session/session.query';
import { SessionService } from './state/session/session.service';
import { WppOpenService } from './_core/services/wpp-open/wpp-open.service';

describe('AppComponent', () => {
	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [AppComponent],
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
					provide: GlobalService,
					useValue: { setAdminMode: () => {} },
				},
				{
					provide: SessionQuery,
					useValue: { isLoggedIn$: of(false), getToken: () => '' },
				},
				{
					provide: SessionService,
					useValue: { setInitialUrl: () => {} },
				},
				{
					provide: DialogService,
					useValue: {},
				},
				{
					provide: WppOpenService,
					useValue: {
						getAccessToken: () => Promise.resolve(null),
						getWorkspaceScope: () => Promise.resolve(null),
						getOsContext: () => Promise.resolve(null),
					},
				},
			],
		}).compileComponents();
	});

	it('should create the app', () => {
		const fixture = TestBed.createComponent(AppComponent);
		const app = fixture.componentInstance;
		expect(app).toBeTruthy();
	});
});
