// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - lodash types not installed
import { groupBy, sortBy } from 'lodash';
import { resolveDotNotationPath } from './object.utils';

/**
 * Move an item in an array to a new position
 * @param arr
 * @param oldIndex
 * @param newIndex
 */
export function arrayMove<T>(
	arr: T[],
	oldIndex: number,
	newIndex: number,
): T[] {
	if (newIndex >= arr.length) {
		let k = newIndex - arr.length + 1;
		while (k--) {
			arr.push(undefined as T);
		}
	}
	arr.splice(newIndex, 0, arr.splice(oldIndex, 1)[0]);
	return arr;
}

/**
 * Pluck the first item from an array
 * @param arr
 */
export function pluckFirst(arr: any[]) {
	if (arr && arr.length > 0) {
		return arr[0];
	} else {
		return undefined;
	}
}

export enum ReduceOperation {
	JOIN = 'join',
	COUNT = 'count',
	SUM = 'sum',
	AVERAGE = 'average',
	FIRST = 'first',
}

export function pluckFromArray(
	input: any[],
	property: string,
	reduceOperation: string,
	filterPath?: string,
	filterValue?: string,
): unknown {
	if (input?.length) {
		let inputArray = input;

		if (!!filterPath && !!filterValue) {
			inputArray = input.filter(
				(item) =>
					resolveDotNotationPath(filterPath, item) === filterValue,
			);
		}

		switch (reduceOperation) {
			case ReduceOperation.JOIN: {
				return inputArray.map((d) => d[property]).join(', ');
			}
			case ReduceOperation.COUNT: {
				return inputArray?.length;
			}
			case ReduceOperation.SUM: {
				return inputArray.reduce(
					(sum, curr) => sum + +curr[property],
					0,
				);
			}
			case ReduceOperation.AVERAGE: {
				const sum = inputArray.reduce(
					(sum, curr) => sum + +curr[property],
					0,
				);
				return sum / inputArray?.length || 0;
			}
			case ReduceOperation.FIRST: {
				return inputArray?.length > 0 ? inputArray[0][property] : [];
			}
			default: {
				return null;
			}
		}
	}

	return null;
}

/**
 * Groups items into arrays based on an iterator function
 * @param items
 * @param iterator
 */
export function groupEntities<T>(
	items: T[],
	iterator: (item: T) => string | number,
) {
	const arr: { name: string; items: T[] }[] = [];
	const obj = groupBy(items, iterator);

	Object.keys(obj).forEach((key) => {
		arr.push({
			name: key,
			items: obj[key],
		});
	});

	return arr;
}

/**
 * Sort items into arrays based on an iterator function
 * @param items
 * @param iterator
 */
export function sortEntities<T>(
	items: T[],
	iterator: (item: T) => string | number | boolean,
) {
	return sortBy(items, iterator);
}

/**
 * Join nested array values together with a custom separator
 */
export function joinWithProp(
	input: any[],
	path = 'name',
	seperator = ', ',
): string {
	if (Array.isArray(input)) {
		return input
			.map((d) => resolveDotNotationPath(path, d))
			.join(seperator);
	} else {
		return '';
	}
}
