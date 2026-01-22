export function scroll(position: number, speed = 30) {
	const scrollToTop = window.setInterval(() => {
		const state = window.pageYOffset;
		if (state > position) {
			window.scrollTo(position, state - speed); // how far to scroll on each step
		} else {
			window.clearInterval(scrollToTop);
		}
	}, 10);
}
