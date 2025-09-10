export class ObjectUtils {
	public static isObject(item) {
		return item && typeof item === 'object' && !Array.isArray(item);
	}

	public static mergeDeep(target, source) {
		if(!this.isObject(target) || !this.isObject(source)) {
			return target;
		}
		// Clone
		target = structuredClone(target);
		source = structuredClone(source);
		for(const [k, v] of Object.entries(source)) {
			if(this.isObject(v)) {
				if(typeof target[k] === 'undefined') {
					target[k] = new (Object.getPrototypeOf(v).constructor)();
				}
				target[k] = this.mergeDeep(target[k], source[k]);
			} else {
				target[k] = v;
			}
		}
		return target;
	}

	public static getPropertyByName(input: Object | any[], keyName: string) {
		for(const [k, v] of Object.entries(input)) {
			if(k === keyName) {
				return v;
			}
			if(Array.isArray(v)) {
				const result = this.getPropertyByName(v, keyName);
				if(result !== -1) {
					return result;
				}
			}
			if(typeof v === 'object') {
				const result = this.getPropertyByName(v, keyName);
				if(result !== -1) {
					return result;
				}
			}
		}
		return -1;
	}
}
