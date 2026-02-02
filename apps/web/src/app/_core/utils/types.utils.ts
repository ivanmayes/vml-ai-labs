/**
 * A bunch of type checking utilties
 */

export const isBoolean = (arg: unknown): arg is boolean => arg === !!arg;

export const isDate = (d: unknown): d is Date =>
	!isNaN(d as number) && d instanceof Date;

export const isError = (err: unknown): err is Error => err instanceof Error;

export const isNil = (val: unknown): val is null | undefined =>
	val === null || val === undefined;

export const isNull = (val: unknown): val is null => val === null;

export const isUndefined = (val: unknown): val is undefined =>
	val === undefined;

export const isNumber = (a: unknown): a is number => typeof a === 'number';

export const isObject = (a: unknown): a is object => a instanceof Object;

export const isRegExp = (obj: unknown): obj is RegExp => obj instanceof RegExp;

export const isString = (a: unknown): a is string => typeof a === 'string';
