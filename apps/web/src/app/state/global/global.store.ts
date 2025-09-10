import { Injectable } from '@angular/core';
import { Store, StoreConfig } from '@datorama/akita';
import { GlobalState, initialGlobalState } from './global.model';

export function createInitialState(): GlobalState {
	return initialGlobalState;
}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'global' })
export class GlobalStore extends Store<GlobalState> {
	constructor() {
		super(createInitialState());
	}
}
