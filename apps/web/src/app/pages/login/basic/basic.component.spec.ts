import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { PrimeNgModule } from '../../../shared/primeng.module';

import { BasicAuthComponent } from './basic.component';

describe('BasicAuthComponent', () => {
	let component: BasicAuthComponent;
	let fixture: ComponentFixture<BasicAuthComponent>;

	beforeEach(
		waitForAsync(() => {
			TestBed.configureTestingModule({
				declarations: [BasicAuthComponent],
				imports: [
					FormsModule,
					BrowserAnimationsModule,
					PrimeNgModule
				]
			}).compileComponents();
		})
	);

	beforeEach(() => {
		fixture = TestBed.createComponent(BasicAuthComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
