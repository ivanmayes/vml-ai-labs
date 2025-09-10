/**
 * Return an object of the differences between the two objects provided.
 * @param o1
 * @param o2
 */
export function diffObjects(o1: object, o2: object) {
	return Object.keys(o2).reduce((diff, key) => {
		if (o1[key] === o2[key]) {
			return diff;
		}

		return {
			...diff,
			[key]: o2[key]
		};
	}, {});
}

/**
 * Safely traverse through an object with a dot notated path string
 * @param path
 * @param obj
 */
export function resolveDotNotationPath(path, obj) {
	return path?.split('.').reduce((prev, curr) => (prev ? prev[curr] : undefined), obj || self);
}

/**
 * Allows you to set a value on an object using a dot notated path string
 * @param obj
 * @param path
 * @param value
 * @returns
 */
export function setObjectValueAtPath(obj: any, path: string | string[], value: any) {
	// Regex explained: https://regexr.com/58j0k
	const pathArray = Array.isArray(path) ? path : path.match(/([^[.\]])+/g);

	pathArray.reduce((acc, key, i) => {
		if (acc[key] === undefined) acc[key] = {};
		if (i === pathArray.length - 1) acc[key] = value;
		return acc[key];
	}, obj);

	return obj;
}

/**
 * Detect if an object is truly empty
 * @param obj
 */
export function objectIsEmpty(obj) {
	let empty = true;

	Object.entries(obj).forEach(([key, value]) => {
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

export function getLastPropertyFromPath(path) {
	let paths = path.split('.');
	return paths[paths.length - 1];
}
