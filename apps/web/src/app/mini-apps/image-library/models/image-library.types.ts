/**
 * Mirror of the API's image-library DTO shapes.
 *
 * Kept inline here because web mini-apps cannot cross-import other mini-apps
 * (`no-restricted-imports` rule in eslint.config.mjs), and a `*Dto` suffix
 * is banned in web. Any DTO field changes on the API side require a touch
 * in this file too.
 */
export interface ImageUploader {
	id: string;
	email: string;
}

export interface ImageResponse {
	id: string;
	signedUrl: string;
	mime: string;
	sizeBytes: number;
	originalFilename: string;
	tags: string[];
	createdAt: string;
	uploadedBy: ImageUploader;
}

export interface ListImagesResponse {
	items: ImageResponse[];
	total: number;
	page: number;
	pageSize: number;
}

export interface TagSuggestion {
	tag: string;
	uses: number;
}

export interface TagSuggestResponse {
	suggestions: TagSuggestion[];
}
