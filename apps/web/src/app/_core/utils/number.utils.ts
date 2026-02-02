import { formatCurrency, formatPercent } from '@angular/common';

export function getNumberWithMask(
	maskType: string,
	value: any,
	currencySymbol?: string,
	locale?: string,
) {
	if (!value) return undefined;

	switch (maskType) {
		case 'currency':
			return (currencySymbol || '$') + getShortNumber(value, 2);

		case 'integer':
			return getShortNumber(value, 2);

		case 'float':
			return formatPercent(
				Number(value) / 100,
				locale || 'en-US',
				'1.0-2',
			);
	}
}

export function getShortNumber(input: any, decimals?: any) {
	if (!input) return input;
	input = Number(input);

	let exp;
	const suffixes = ['K', 'M', 'B', 'T', 'P', 'E'];
	const isNegativeValues = input < 0;
	if (
		Number.isNaN(input) ||
		(input < 1000 && input >= 0) ||
		!isNumeric(input) ||
		(input < 0 && input > -1000)
	) {
		if (!!decimals && isNumeric(input) && !(input < 0) && input !== 0) {
			return input.toFixed(decimals);
		} else {
			return input;
		}
	}

	if (!isNegativeValues) {
		exp = Math.floor(Math.log(input) / Math.log(1000));
		return (
			(input / Math.pow(1000, exp)).toFixed(decimals) + suffixes[exp - 1]
		);
	} else {
		input = input * -1;

		exp = Math.floor(Math.log(input) / Math.log(1000));

		return (
			((input * -1) / Math.pow(1000, exp)).toFixed(decimals) +
			suffixes[exp - 1]
		);
	}
}

export function isNumeric(value: number | string): boolean {
	if (typeof value === 'number' && value < 0) value = value * -1;
	const strValue = String(value);
	if (/^-{0,1}\d+$/.test(strValue)) {
		return true;
	} else if (/^\d+\.\d+$/.test(strValue)) {
		return true;
	} else {
		return false;
	}
}

export function numberToCurrency(
	num: number,
	config: {
		locale?: string;
		currencySymbol?: string;
		currencyCode?: string;
		digitsInfo?: string;
	},
) {
	return formatCurrency(
		num,
		config.locale || 'en-US',
		config.currencySymbol || '$',
		config.currencyCode || 'USD',
		config.digitsInfo || '1.0-2',
	);
}
