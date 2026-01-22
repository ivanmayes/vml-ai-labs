import { Pipe, PipeTransform } from '@angular/core';
import { GlobalQuery } from '../../state/global/global.query';
import { resolveDotNotationPath } from '../../_core/utils/object.utils';

@Pipe({
	standalone: false,
    name: 'entityFieldMask',
    
})
export class EntityFieldMaskPipe implements PipeTransform {
	constructor(private readonly globalQuery: GlobalQuery) {}

	transform(value: string, maskPath: string): string {
		return resolveDotNotationPath(maskPath, this.globalQuery.getValue().settings.settings.entities) || value;
	}
}
