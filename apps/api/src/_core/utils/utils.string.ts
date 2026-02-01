const isDebug = process.env.DEBUG || false;

export interface Address {
	street?: string;
	city?: string;
	state?: string;
	zip?: string;
}

export class String {
	// Note, this will NOT work for anything but the simplest cases.
	// ex: McTavish, will not come out properly.
	public static titleCase(input: any): any {
		if (!(typeof input === 'string')) {
			return input;
		}
		return input
			.split(' ')
			.map((i) => {
				return (
					i[0].toUpperCase() +
					(i.length > 1 ? i.slice(1).toLowerCase() : '')
				);
			})
			.join(' ');
	}

	public static slugify(input: string) {
		const str = input || '';
		return str
			.trim()
			.toLowerCase()
			.replace(/\s/g, '-')
			.replace(/[^a-z0-9-]/g, '');
	}

	public static addTrailingSlash(input: string) {
		const str = input || '';
		return str.endsWith('/') ? str : str + '/';
	}

	public static toAddress(address: string): Address {
		if (!address || !address.length) {
			return {
				street: undefined,
				city: undefined,
				state: undefined,
				zip: undefined,
			};
		}
		// Normalize: remove double spaces, comma space, and trim whitespace.
		const normalized = address
			.replace(/\s\s/g, ' ')
			.replace(/\s,/g, ',')
			.trim();

		// Parse what we can.
		try {
			const stateZip = normalized
				.substring(normalized.lastIndexOf(',') + 1, normalized.length)
				.trim()
				.split(' ');
			const streetCity = normalized
				.substring(0, normalized.lastIndexOf(','))
				.trim();

			const street = streetCity
				.substring(0, streetCity.lastIndexOf(','))
				.trim();
			const city = streetCity
				.substring(streetCity.lastIndexOf(',') + 1, streetCity.length)
				.trim();
			const state = stateZip[0];
			const zip = stateZip[1];

			return { street, city, state, zip };
		} catch (err) {
			if (isDebug) {
				console.log(err);
			}
			return {
				street: undefined,
				city: undefined,
				state: undefined,
				zip: undefined,
			};
		}
	}

	public static cleanIPAddress(ip: string): string {
		if (!ip?.length) {
			return '';
		}

		let cleaned = ip.trim();

		// V6-V4 wrapper.
		if (cleaned.includes('::ffff:')) {
			cleaned = cleaned.replace(/::ffff:/g, '');
		}
		// V6 with port.
		if (cleaned.includes(']')) {
			return cleaned
				.slice(0, cleaned.lastIndexOf(':'))
				.replace('[', '')
				.replace(']', '');
		}
		// V4 with port.
		else if (cleaned.match(/:/g)?.length === 1) {
			return cleaned.split(':')[0];
		}

		return cleaned;
	}
}
