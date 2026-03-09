/**
 * Box file metadata returned from folder listing.
 */
export interface BoxFile {
	id: string;
	name: string;
	size: number;
	modifiedAt: Date;
	extension: string;
	/** Full folder path within Box */
	path: string;
}

/**
 * Box folder validation result.
 */
export interface BoxFolderInfo {
	name: string;
	fileCount: number;
}
