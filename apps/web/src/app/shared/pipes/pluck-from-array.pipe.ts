import { Pipe, PipeTransform } from '@angular/core';
import { pluckFromArray } from '../../_core/utils/array.utils';

@Pipe({
    name: 'pluckFromArray',
    standalone: false
})
export class PluckFromArrayPipe implements PipeTransform {
	transform = pluckFromArray;
}
