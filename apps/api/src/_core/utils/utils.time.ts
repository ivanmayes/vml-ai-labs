export class Time {
	public static durationStringToMs(durationString: string): number {
		if (!durationString) {
			return 0;
		}

		const durationMultiplier = parseFloat(durationString);
		const durationType = durationString.replace(/[0-9.]/g, '');

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

	// From MS
	public static msToS(ms: number): number {
		return ms / 1000;
	}

	public static msToM(ms: number): number {
		return this.msToS(ms) / 60;
	}

	public static msToH(ms: number): number {
		return this.msToM(ms) / 60;
	}

	public static msToD(ms: number): number {
		return this.msToH(ms) * 24;
	}

	// To MS
	public static sToMs(s: number): number {
		return s * 1000;
	}

	public static mToMs(m: number): number {
		return this.sToMs(m) * 60;
	}

	public static hToMs(h: number): number {
		return this.mToMs(h) * 60;
	}

	public static dToMs(d: number): number {
		return this.hToMs(d) * 24;
	}
}
