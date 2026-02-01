import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { SessionService } from '../../../state/session/session.service';

import { OktaAuthComponent } from './okta.component';

describe('OktaAuthComponent', () => {
	let component: OktaAuthComponent;
	let fixture: ComponentFixture<OktaAuthComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [OktaAuthComponent],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{
					provide: SessionService,
					useValue: { oktaSignIn: () => {} },
				},
			],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(OktaAuthComponent);
		component = fixture.componentInstance;
		// Don't call fixture.detectChanges() because ngOnInit requires Okta config
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
