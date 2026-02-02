/**
 * Space-related types for the web application.
 *
 * DTOs are imported from the API to ensure consistency.
 * Response interfaces represent the actual API response shapes.
 */

// Import DTOs from API - these are the source of truth for request payloads
export type { SpaceCreateDto } from '@api/space/dtos';
export type { SpaceUpdateDto } from '@api/space/dtos';
export type { SpaceUpdateSettingsDto } from '@api/space/dtos';
export type { SpacePublicDetailsDto } from '@api/space/dtos';

// Re-export with aliases for backward compatibility
export type { SpaceCreateDto as CreateSpaceDto } from '@api/space/dtos';
export type { SpaceUpdateDto as UpdateSpaceDto } from '@api/space/dtos';

// Import entity types from API
export type { PublicSpace, MinimalSpace } from '@api/space/space.entity';

/**
 * Space response interface - represents what the API returns.
 * This matches the API's Space entity structure for client-side usage.
 */
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
