import { Directive, OnInit, Renderer2, Input, ElementRef } from '@angular/core';

/**
 * Fill Height Directive
 * This directive will make a component's height extend down to the bottom of the page based on where it is located
 */
@Directive({
	standalone: false,
	selector: '[appFillHeight]',
})
export class FillHeightDirective implements OnInit {
	@Input() paddingBottom = 0;

	public domElement;

	constructor(
		private renderer: Renderer2,
		private el: ElementRef,
	) {}

	ngOnInit() {
		if (this.el?.nativeElement) {
			this.domElement = this.el.nativeElement;
			this.renderer.listen(window, 'resize', () => {
				this.fillHeight();
			});
			this.fillHeight();
		}
	}

	fillHeight() {
		const top = this.domElement.getBoundingClientRect().top;
		const height = window.innerHeight - top - this.paddingBottom;
		this.renderer.setStyle(this.domElement, 'overflow', `auto`);
		this.renderer.setStyle(this.domElement, 'width', `100%`);
		this.renderer.setStyle(this.domElement, 'height', `${height}px`);
	}
}
