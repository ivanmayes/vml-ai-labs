import { Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Query } from '@datorama/akita';
import { filter } from 'rxjs/operators';

import type { OrganizationSettings } from '../../shared/models/organization-settings.model';

import { GlobalSettings, GlobalState } from './global.model';
import { GlobalStore } from './global.store';

@Injectable({ providedIn: 'root' })
export class GlobalQuery extends Query<GlobalState> {
	// Observable selectors (keep for backward compatibility)
	public authenticatedSettings$ = this.select('settings').pipe(
		filter((settings) => (settings?.id ? true : false)),
	);

	// Signal-based selectors for zoneless
	readonly settings = toSignal(this.select('settings'));
	readonly header = toSignal(this.select('header'));
	readonly adminMode = toSignal(this.select('adminMode'));

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
