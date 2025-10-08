import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { PrimeNgModule } from '../../../shared/primeng.module';

import { OktaAuthComponent } from './okta.component';

describe('OktaAuthComponent', () => {
	let component: OktaAuthComponent;
	let fixture: ComponentFixture<OktaAuthComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [OktaAuthComponent],
			imports: [
				BrowserAnimationsModule,
				PrimeNgModule
			]
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(OktaAuthComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
