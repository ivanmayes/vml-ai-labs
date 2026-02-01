export class ObjectUtils {
	public static isObject(item: unknown): boolean {
		return (
			item !== null && typeof item === 'object' && !Array.isArray(item)
		);
	}

	public static mergeDeep<T extends Record<string, unknown>>(
		target: T,
		source: T,
	): T {
		if (!this.isObject(target) || !this.isObject(source)) {
			return target;
		}
		// Clone
		const clonedTarget = structuredClone(target) as Record<string, unknown>;
		const clonedSource = structuredClone(source) as Record<string, unknown>;
		for (const [k, v] of Object.entries(clonedSource)) {
			if (this.isObject(v)) {
				if (typeof clonedTarget[k] === 'undefined') {
					clonedTarget[k] = new (Object.getPrototypeOf(
						v,
					).constructor)();
				}
				clonedTarget[k] = this.mergeDeep(
					clonedTarget[k] as Record<string, unknown>,
					clonedSource[k] as Record<string, unknown>,
				);
			} else {
				clonedTarget[k] = v;
			}
		}
		return clonedTarget as T;
	}

	public static getPropertyByName(
		input: object | unknown[],
		keyName: string,
	): unknown {
		for (const [k, v] of Object.entries(input)) {
			if (k === keyName) {
				return v;
			}
			if (Array.isArray(v)) {
				const result: unknown = this.getPropertyByName(v, keyName);
				if (result !== -1) {
					return result;
				}
			}
			if (typeof v === 'object' && v !== null) {
				const result: unknown = this.getPropertyByName(
					v as object,
					keyName,
				);
				if (result !== -1) {
					return result;
				}
			}
		}
		return -1;
	}
}
