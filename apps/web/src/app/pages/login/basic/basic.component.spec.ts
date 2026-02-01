import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { GlobalQuery } from '../../../state/global/global.query';
import { SessionQuery } from '../../../state/session/session.query';
import { SessionService } from '../../../state/session/session.service';

import { BasicAuthComponent } from './basic.component';

describe('BasicAuthComponent', () => {
	let component: BasicAuthComponent;
	let fixture: ComponentFixture<BasicAuthComponent>;

	beforeEach(waitForAsync(() => {
		TestBed.configureTestingModule({
			imports: [BasicAuthComponent],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				provideAnimations(),
				{
					provide: GlobalQuery,
					useValue: { select: () => of({}) },
				},
				{
					provide: SessionQuery,
					useValue: { selectLoading: () => of(false) },
				},
				{
					provide: SessionService,
					useValue: { activateEmail: () => of({}) },
				},
			],
		}).compileComponents();
	}));

	beforeEach(() => {
		fixture = TestBed.createComponent(BasicAuthComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
