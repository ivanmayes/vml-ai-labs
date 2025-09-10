import { Pipe, PipeTransform } from '@angular/core';
import { joinWithProp } from '../../_core/utils/array.utils';

/**
 * Join With Property Pipe
 * Takes an array and joins it into a string with a custom separator
 */
@Pipe({
    name: 'joinWithProp',
    standalone: false
})
export class JoinWithPropPipe implements PipeTransform {
	public transform = joinWithProp;
}
