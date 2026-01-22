import { Pipe, PipeTransform } from '@angular/core';
import { pluckFromArray } from '../../_core/utils/array.utils';

@Pipe({
	standalone: false,
    name: 'pluckFromArray',
    
})
export class PluckFromArrayPipe implements PipeTransform {
	transform = pluckFromArray;
}
