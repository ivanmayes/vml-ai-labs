import type { OrganizationSettings } from '../../../../../api/src/organization/organization.settings';

export interface GlobalState {
	header: HeaderSettings;
	settings: GlobalSettings;
	adminMode: boolean;
}

export const initialGlobalState: GlobalState = {
	header: {
		visible: true,
		invert: false,
		floating: false
	},
	settings: undefined,
	adminMode: false
};

/**
 * Global Settings Model
 * This model reflects the organization settings that come from the API
 * These settings contain the default options for most entities as well as any
 * org-level configuration.
 */
export interface GlobalSettings {
	id: string;
	name: string;
	settings: OrganizationSettings;
	authenticationStrategies: any;
}

/**
 * This list helps describe the major entities in the system for typing.
 */
export type Entities = 'tactic';

/**
 * Settings that can be applied to the top header.
 */
export interface HeaderSettings {
	visible: boolean;
	invert: boolean;
	floating: boolean;
}

/**
 * A generic grouped option container.  Used for nested select compnonents.
 */
export interface OptionGroup<T> {
	name: string;
	items: T[];
}

export interface ValueChange {
	key: string;
	value: any;
}

/**
 * This object helps wrap debounced changes so that you can pipe through
 * debounce methods before subscribing and doing something with the value.
 */
export interface DebouncedValueChange extends ValueChange {
	debounceTime: number;
}

export interface FormPropertyUpdateObject {
	fieldName: string;
	data: any;
}

/**
 * API Map model
 * This model describes a map of domain selectors that can point to a specific api endpoint.
 * It's used to determine what API to use on production if we want to support multiple tenants on one instance.
 */
export interface ApiMap {
	domain: string;
	endpoint: string;
	organizationId: string;
}

/**
 * Tracks the progress of a file upload
 */
export interface FileProgressData {
	progress: number;
	error: string;
}

/**
 * Entities can have 'modes' that describe whether the UI should allow editing or creating those entities.
 */
export type EntityContainerMode = 'create' | 'edit' | 'snapshot';
