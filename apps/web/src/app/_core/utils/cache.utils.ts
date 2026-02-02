/**
 * A simple data cache class.
 * Use it to simply cache some http requests to save on calls
 * or for whatever
 */
export class DataCache {
	public data: Record<string, any> = {};

	get(key: string) {
		if (key) {
			return this.data[key];
		}

		if (key === '') {
			return this.data['@@'];
		}

		// Empty key - nothing to retrieve
	}

	set(key: string, data: unknown): unknown {
		if (key) {
			return (this.data[key] = data);
		}

		if (key === '') {
			return (this.data['@@'] = data);
		}

		// Empty key - cannot store data
		return undefined;
	}
}
