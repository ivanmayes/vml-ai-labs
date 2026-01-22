import { trigger, state, style, transition, animate } from '@angular/animations';

/**
 * A Flexible fade animation
 * @param name
 * @param duration
 * @param x
 * @param y
 */
export function fade(name: string, duration: number, x = '0', y = '0') {
	return trigger(name, [
		state('in', style({ opacity: 1 })),
		transition(':enter', [style({ opacity: 0, transform: `translate3d(${x}, ${y}, 0)` }), animate(duration)]),
		transition(':leave', animate(duration, style({ opacity: 0, transform: `translate3d(${x}, ${y}, 0)` })))
	]);
}
