export interface Space {
	id: string;
	name: string;
	organizationId?: string;
	created: string;
}

export interface CreateSpaceDto {
	name: string;
}

export interface UpdateSpaceDto {
	name?: string;
}
