import { Pipe, PipeTransform } from '@angular/core';

import { GlobalQuery } from '../../state/global/global.query';
import { resolveDotNotationPath } from '../../_core/utils/object.utils';

@Pipe({
	name: 'entityFieldMask',
	standalone: true,
})
export class EntityFieldMaskPipe implements PipeTransform {
	constructor(private readonly globalQuery: GlobalQuery) {}

	transform(value: string, maskPath: string): string {
		const entities =
			this.globalQuery.getValue().settings?.settings?.entities;
		if (!entities) {
			return value;
		}
		const result = resolveDotNotationPath(
			maskPath,
			entities as Record<string, unknown>,
		);
		return (result as string) ?? value;
	}
}
