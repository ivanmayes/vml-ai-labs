/**
 * Return an object of the differences between the two objects provided.
 * @param o1
 * @param o2
 */
export function diffObjects(
	o1: Record<string, unknown>,
	o2: Record<string, unknown>,
): Record<string, unknown> {
	return Object.keys(o2).reduce((diff, key) => {
		if (o1[key] === o2[key]) {
			return diff;
		}

		return {
			...diff,
			[key]: o2[key],
		};
	}, {});
}

/**
 * Safely traverse through an object with a dot notated path string
 * @param path
 * @param obj
 */
export function resolveDotNotationPath(
	path: string,
	obj: Record<string, unknown>,
): unknown {
	return path
		?.split('.')
		.reduce(
			(prev: unknown, curr: string) =>
				prev ? (prev as Record<string, unknown>)[curr] : undefined,
			obj || self,
		);
}

/**
 * Allows you to set a value on an object using a dot notated path string
 * @param obj
 * @param path
 * @param value
 * @returns
 */
export function setObjectValueAtPath(
	obj: Record<string, unknown>,
	path: string | string[],
	value: unknown,
): Record<string, unknown> {
	// Regex explained: https://regexr.com/58j0k
	const pathArray = Array.isArray(path)
		? path
		: (path.match(/([^[.\]])+/g) ?? []);

	pathArray.reduce((acc: Record<string, unknown>, key: string, i: number) => {
		if (acc[key] === undefined) acc[key] = {};
		if (i === pathArray.length - 1) acc[key] = value;
		return acc[key] as Record<string, unknown>;
	}, obj);

	return obj;
}

/**
 * Detect if an object is truly empty
 * @param obj
 */
export function objectIsEmpty(obj: Record<string, unknown>): boolean {
	let empty = true;

	Object.entries(obj).forEach(([_key, value]) => {
		if (value) {
			empty = false;
		}
	});

	return empty;
}
/**
 * Returns the last property for a given dotted path
 * @param path
 */

export function getLastPropertyFromPath(path: string): string {
	const paths = path.split('.');
	return paths[paths.length - 1];
}
