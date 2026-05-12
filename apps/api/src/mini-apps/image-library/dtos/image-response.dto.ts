export interface ImageUploaderDto {
	id: string;
	email: string;
}

export interface ImageResponseDto {
	id: string;
	signedUrl: string;
	mime: string;
	sizeBytes: number;
	originalFilename: string;
	tags: string[];
	createdAt: Date;
	uploadedBy: ImageUploaderDto;
}

export interface ListImagesResponseDto {
	items: ImageResponseDto[];
	total: number;
	page: number;
	pageSize: number;
}

export interface TagSuggestionDto {
	tag: string;
	uses: number;
}

export interface TagSuggestResponseDto {
	suggestions: TagSuggestionDto[];
}
