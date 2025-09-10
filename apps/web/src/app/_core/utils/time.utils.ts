export class TimeUtils {
	/**
	 * Converts a duration string to a number of milliseconds.
	 *
	 * @param durationString A common duration string: 1h (1 hour), 1d (1 day), 1m (1 minute), 1s (1 second).
	 */
	public static durationStringToMs(durationString: string): number {
		if (!durationString) {
			return 0;
		}

		const durationMultiplier = parseFloat(durationString);
		const durationType = durationString.replace(/[0-9\.]/g, '');

		switch (durationType) {
			case 'h':
				return this.hToMs(1 * durationMultiplier);
			case 'd':
				return this.dToMs(1 * durationMultiplier);
			case 'm':
				return this.mToMs(1 * durationMultiplier);
			case 's':
				return this.sToMs(1 * durationMultiplier);
			default:
				return 0;
		}
	}

	/**
	 * Converts a duration string to an SQL-compatable duration string.
	 *
	 * @param durationString A common duration string: 1h (1 hour), 1d (1 day), 1m (1 minute), 1s (1 second).
	 */
	public static durationStringToSQLFormat(durationString: string): string {
		if (durationString.includes('h')) {
			return durationString.replace('h', ' hours');
		}
		if (durationString.includes('d')) {
			return durationString.replace('d', ' days');
		}
		if (durationString.includes('m')) {
			return durationString.replace('m', ' minutes');
		}
		if (durationString.includes('s')) {
			return durationString.replace('s', ' seconds');
		}
		return durationString;
	}

	/**
	 * Gets the number of days, hours, minutes, seconds, and milliseconds between two dates.
	 * @param date
	 * @returns
	 */
	public static getTimeUntilDate(date: string): { days: number, hours: number, minutes: number, seconds: number } {
		const now = new Date().getTime();
		const then = new Date(date).getTime();

		// get total seconds between the times
		var delta = Math.abs(then - now) / 1000;

		// calculate (and subtract) whole days
		var days = Math.floor(delta / 86400);
		delta -= days * 86400;

		// calculate (and subtract) whole hours
		var hours = Math.floor(delta / 3600) % 24;
		delta -= hours * 3600;

		// calculate (and subtract) whole minutes
		var minutes = Math.floor(delta / 60) % 60;
		delta -= minutes * 60;

		// what's left is seconds
		var seconds = delta % 60;

		return { days, hours, minutes, seconds };
	}

	// From MS
	/**
	 * Convert milliseconds to seconds.
	 *
	 * @param ms
	 */
	public static msToS(ms: number): number {
		return ms / 1000;
	}

	/**
	 * Convert milliseconds to minutes.
	 *
	 * @param ms
	 */
	public static msToM(ms: number): number {
		return this.msToS(ms) / 60;
	}

	/**
	 * Convert milliseconds to hours.
	 *
	 * @param ms
	 */
	public static msToH(ms: number): number {
		return this.msToM(ms) / 60;
	}

	/**
	 * Convert milliseconds to days.
	 *
	 * @param ms
	 */
	public static msToD(ms: number): number {
		return this.msToH(ms) * 24;
	}

	// To MS
	/**
	 * Convert seconds to milliseconds.
	 *
	 * @param s
	 */
	public static sToMs(s: number): number {
		return s * 1000;
	}

	/**
	 * Convert minutes to milliseconds.
	 *
	 * @param m
	 */
	public static mToMs(m: number): number {
		return this.sToMs(m) * 60;
	}

	/**
	 * Convert hours to milliseconds.
	 *
	 * @param h
	 */
	public static hToMs(h: number): number {
		return this.mToMs(h) * 60;
	}

	/**
	 * Convert days to milliseconds.
	 *
	 * @param d
	 */
	public static dToMs(d: number): number {
		return this.hToMs(d) * 24;
	}
}
