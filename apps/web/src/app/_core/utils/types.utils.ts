/**
 * A bunch of type checking utilties
 */

export const isBoolean = arg => arg === !!arg;

export const isDate = d => !isNaN(d) && d instanceof Date;

export const isError = err => err instanceof Error;

export const isNil = val => val == null;

export const isNull = val => val === null;

export const isUndefined = val => val === undefined;

export const isNumber = a => typeof a === 'number';

export const isObject = a => a instanceof Object;

export const isRegExp = obj => obj instanceof RegExp;

export const isString = a => typeof a === 'string';
