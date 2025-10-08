export interface Space {
	id: string;
	name: string;
	organizationId?: string;
	created: string;
	isPublic?: boolean;
	settings?: {
		primaryColor?: string;
	};
}

export interface CreateSpaceDto {
	name: string;
	isPublic?: boolean;
}

export interface UpdateSpaceDto {
	name?: string;
	isPublic?: boolean;
}

export interface SpaceUpdateSettingsDto {
	name?: string;
	isPublic?: boolean;
	settings?: {
		primaryColor?: string;
	};
}

export interface SpacePublicDetailsDto {
	name: string;
}
