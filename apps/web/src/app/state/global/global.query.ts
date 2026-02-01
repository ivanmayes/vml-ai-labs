import { Injectable } from '@angular/core';
import { Query } from '@datorama/akita';
import { filter } from 'rxjs/operators';

import type { OrganizationSettings } from '../../../../../api/src/organization/organization.settings';

import { GlobalSettings, GlobalState } from './global.model';
import { GlobalStore } from './global.store';

@Injectable({ providedIn: 'root' })
export class GlobalQuery extends Query<GlobalState> {
	// Get Settings only if the user is authenticated
	public authenticatedSettings$ = this.select('settings').pipe(
		filter((settings) => (settings?.id ? true : false)),
	);

	constructor(protected override store: GlobalStore) {
		super(store);
	}

	getSetting(key: keyof GlobalSettings) {
		return this.getValue().settings?.[key];
	}

	getOrgSetting(key: keyof OrganizationSettings): unknown {
		return this.getValue().settings?.settings?.[key];
	}
}
