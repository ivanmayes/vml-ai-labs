/**
 * Mask configuration for the imask plugin
 * https://www.npmjs.com/package/angular-imask
 */

// Type declaration for IMask when the module is not installed
interface IMaskMaskedDynamic {
	value: string;
	compiledMasks: unknown[];
}

export const percentMask = {
	mask: 'num%',
	lazy: false,
	blocks: {
		num: {
			mask: Number,
			scale: 3,
			radix: '.',
			mapToRadix: [','],
		},
	},
};

export const numberMask = {
	mask: '$num',
	lazy: false,
	blocks: {
		num: {
			// nested masks are available!
			mask: Number,
			scale: 3,
			thousandsSeparator: ',',
			radix: '.',
		},
	},
};

export const currencyMask = {
	mask: '$num',
	lazy: false,
	blocks: {
		num: {
			// nested masks are available!
			mask: Number,
			scale: 3,
			thousandsSeparator: ',',
			radix: '.',
		},
	},
};

export const currencyMaskWithDecimal = {
	mask: '$num',
	blocks: {
		num: {
			// nested masks are available!
			mask: Number,
			scale: 2,
			thousandsSeparator: ',',
			padFractionalZeros: true, // if true, then pads zeros at end to the length of scale
			normalizeZeros: false,
			radix: '.',
		},
	},
};

// Version 1: $-123.00
// export const currencyMaskWithDecimalWithNegatives = {
// 	mask: '$num',
// 	blocks: {
// 		num: {
// 			// nested masks are available!
// 			mask: Number,
// 			scale: 2,
// 			thousandsSeparator: ',',
// 			padFractionalZeros: true, // if true, then pads zeros at end to the length of scale
// 			normalizeZeros: false,
// 			radix: '.',
// 			signed: true
// 		}
// 	}
// };

// https://github.com/uNmAnNeR/imaskjs/issues/328
// Link to github discussion for this exact issue. #91 `geo-shopper-planning-web`
// Version 2: -$123.00
export const maskProps = {
	mask: Number,
	thousandsSeparator: ',',
	scale: 2,
	signed: true, // allow negative
	normalizeZeros: false,
	radix: '.',
	padFractionalZeros: true, // if true, then pads zeros at end to the length of scale
};

export const currencyMaskWithDecimalWithNegatives = {
	mask: [
		{
			mask: '',
		},
		{
			mask: '$num',
			blocks: {
				num: maskProps,
			},
		},
		{
			mask: '-$num',
			blocks: {
				num: maskProps,
			},
		},
	],
	dispatch: (
		appended: string,
		dynamicMasked: IMaskMaskedDynamic,
		flags: unknown,
	) => {
		let index = /[-]/i.test(dynamicMasked.value) ? 2 : 1;

		if (appended === '-' && !dynamicMasked.value) {
			index = 2;
		} else if (
			appended !== '-' &&
			flags?.input &&
			!/[-]/i.test(dynamicMasked.value)
		) {
			index = 1;
		}

		// Switch to no 'CURRENCY SIGN' mask if no numerical digit in the value
		if (/^[-]?\$$/.test((dynamicMasked.value + appended).trim())) {
			index = 0;
		}
		return dynamicMasked.compiledMasks[index];
	},
};
