export function scroll(position: number, speed: number = 30) {
	let scrollToTop = window.setInterval(() => {
		let state = window.pageYOffset;
		if (state > position) {
			window.scrollTo(position, state - speed); // how far to scroll on each step
		} else {
			window.clearInterval(scrollToTop);
		}
	}, 10);
}
