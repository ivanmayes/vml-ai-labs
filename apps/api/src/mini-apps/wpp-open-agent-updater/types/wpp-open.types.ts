/**
 * WPP Open agent summary from listing endpoint.
 */
export interface WppOpenAgent {
	id: string;
	name: string;
	description?: string;
	category?: string;
	/**
	 * The CS-internal project that owns this agent. Captured from the
	 * `listAgents` response when CS includes it. Carrying it through to
	 * the task save lets the user re-point an agent regardless of which
	 * workspace they're currently in.
	 */
	projectId?: string;
}

/**
 * Full WPP Open agent configuration.
 */
export interface WppOpenAgentConfig {
	id: string;
	name: string;
	description?: string;
	/** Files attached to the agent (CS API uses this for knowledge documents) */
	files?: (CSFileUploadItem | CSFileItem)[];
	/** Remaining config fields are opaque */
	[key: string]: unknown;
}

/**
 * Individual knowledge item used internally before upload.
 */
export interface WppOpenKnowledgeItem {
	/** Document title/name */
	title: string;
	/** Document content (text/markdown) */
	content: string;
	/** Source metadata */
	source?: string;
}

/**
 * S3 file location reference used by the CS API.
 */
export interface CSFileLocation {
	bucket: string;
	key: string;
	metadata?: {
		numberOfPages?: number;
		fileSizeInBytes?: number;
	};
}

/**
 * File upload item for new files being added to an agent config.
 * Requires temporaryFileLocation from the Transfer Service.
 */
export interface CSFileUploadItem {
	uid: string;
	temporaryFileLocation: CSFileLocation;
	optimizedFileLocation?: CSFileLocation;
	fileName: string;
	status: 'done';
	// `content` intentionally omitted — see comments in
	// `WppOpenAgentService.upsertKnowledge`. CS's DynamoDB item has a 400KB
	// cap and stores everything we send on each file; CS reads content
	// from S3 (`optimizedFileLocation`) when it builds the S3 config file.
}

/**
 * Persistent file item already stored in an agent config.
 */
export interface CSFileItem {
	persistentFileLocation: CSFileLocation;
	optimizedFileLocation?: CSFileLocation;
	fileName?: string;
	content?: string;
	numberOfPages?: number;
	fileSizeInBytes?: number;
	previewSignedUrl?: string;
}

/**
 * Transfer Service upload config response.
 * Wrapped in { data: ... } by the CS API response builder.
 */
export interface TransferUploadConfig {
	signedUrl: string;
	previewSignedUrl?: string;
	temporaryFileLocation: {
		bucket: string;
		key: string;
	};
	id: string;
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
