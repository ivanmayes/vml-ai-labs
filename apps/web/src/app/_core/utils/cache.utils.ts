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

		console.warn('Couldnt get data for empty key', key);
	}

	set(key, data) {
		if (key) {
			return (this.data[key] = data);
		}

		if (key === '') {
			return (this.data['@@'] = data);
		}

		console.warn('Couldnt set data for empty key', key, data);
	}
}
