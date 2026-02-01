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
		if (!input) {
			input = '';
		}
		return input
			.trim()
			.toLowerCase()
			.replace(/\s/g, '-')
			.replace(/[^a-z0-9\-]/g, '');
	}

	public static addTrailingSlash(input: string) {
		if (!input) {
			input = '';
		}
		return input.endsWith('/') ? input : input + '/';
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
		// Remove double spaces.
		address = address.replace(/\s\s/g, ' ');
		// Remove comma space.
		address = address.replace(/\s,/g, ',');
		// Remove junk whitespace.
		address = address.trim();
		let street, city, state, zip;

		// Parse what we can.
		try {
			const stateZip = address
				.substring(address.lastIndexOf(',') + 1, address.length)
				.trim()
				.split(' ');
			const streetCity = address
				.substring(0, address.lastIndexOf(','))
				.trim();

			street = streetCity
				.substring(0, streetCity.lastIndexOf(','))
				.trim();
			city = streetCity
				.substring(streetCity.lastIndexOf(',') + 1, streetCity.length)
				.trim();
			state = stateZip[0];
			zip = stateZip[1];
		} catch (err) {
			if (isDebug) {
				console.log(err);
			}
		}

		return {
			street,
			city,
			state,
			zip,
		};
	}

	public static cleanIPAddress(ip: string): string {
		if (!ip?.length) {
			return '';
		}

		ip = ip.trim();

		// V6-V4 wrapper.
		if (ip.includes('::ffff:')) {
			ip = ip.replace(/::ffff:/g, '');
		}
		// V6 with port.
		if (ip.includes(']')) {
			return ip
				.slice(0, ip.lastIndexOf(':'))
				.replace('[', '')
				.replace(']', '');
		}
		// V4 with port.
		else if (ip.match(/:/g)?.length === 1) {
			return ip.split(':')[0];
		}

		return ip;
	}
}
