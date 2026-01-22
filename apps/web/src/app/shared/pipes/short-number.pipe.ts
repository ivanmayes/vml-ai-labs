import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'shortNumber',
    
})
export class ShortNumberPipe implements PipeTransform {
	transform(input: any, args?: any): any {
		if (!input) return input;
		input = Number(input);

		let exp;
		const suffixes = ['K', 'M', 'B', 'T', 'P', 'E'];
		const isNegativeValues = input < 0;
		if (Number.isNaN(input) || (input < 1000 && input >= 0) || !this.isNumeric(input) || (input < 0 && input > -1000)) {
			if (!!args && this.isNumeric(input) && !(input < 0) && input != 0) {
				console.log(input);
				return input.toFixed(args);
			} else {
				return input;
			}
		}

		if (!isNegativeValues) {
			exp = Math.floor(Math.log(input) / Math.log(1000));
			return (input / Math.pow(1000, exp)).toFixed(args) + suffixes[exp - 1];
		} else {
			input = input * -1;

			exp = Math.floor(Math.log(input) / Math.log(1000));

			return ((input * -1) / Math.pow(1000, exp)).toFixed(args) + suffixes[exp - 1];
		}
	}

	isNumeric(value): boolean {
		if (value < 0) value = value * -1;
		if (/^-{0,1}\d+$/.test(value)) {
			return true;
		} else if (/^\d+\.\d+$/.test(value)) {
			return true;
		} else {
			return false;
		}
	}
}
