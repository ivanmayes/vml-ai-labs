/**
 * WPP Open agent summary from listing endpoint.
 */
export interface WppOpenAgent {
	id: string;
	name: string;
	description?: string;
	category?: string;
}

/**
 * Full WPP Open agent configuration.
 */
export interface WppOpenAgentConfig {
	id: string;
	name: string;
	description?: string;
	/** Knowledge items attached to the agent */
	knowledge?: WppOpenKnowledgeItem[];
	/** Remaining config fields are opaque */
	[key: string]: unknown;
}

/**
 * Individual knowledge item within an agent config.
 * Structure TBD — will be confirmed via API exploration.
 */
export interface WppOpenKnowledgeItem {
	/** Document identifier */
	id?: string;
	/** Document title/name */
	title: string;
	/** Document content (text/markdown) */
	content: string;
	/** Source metadata */
	source?: string;
}

/**
 * OS Context for CS auth header construction.
 */
export interface WppOpenOsContext {
	hierarchy?: {
		azId?: string;
		mapping?: Record<string, unknown>;
	};
	project?: {
		azId?: string;
		id?: string;
		name?: string;
	};
	tenant?: {
		azId?: string;
		id?: string;
		name?: string;
	};
}
