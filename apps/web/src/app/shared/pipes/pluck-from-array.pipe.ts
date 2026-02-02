import { Pipe, PipeTransform } from '@angular/core';

import { pluckFromArray } from '../../_core/utils/array.utils';

@Pipe({
	name: 'pluckFromArray',
	standalone: true,
})
export class PluckFromArrayPipe implements PipeTransform {
	transform = pluckFromArray;
}
