import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { BasicAuthComponent } from './basic.component';

describe('BasicAuthComponent', () => {
	let component: BasicAuthComponent;
	let fixture: ComponentFixture<BasicAuthComponent>;

	beforeEach(
		waitForAsync(() => {
			TestBed.configureTestingModule({
				declarations: [BasicAuthComponent]
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
