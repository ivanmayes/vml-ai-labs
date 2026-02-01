/**
 * SpaceUser-related types for the web application.
 *
 * DTOs are imported from the API to ensure consistency.
 * Response interfaces represent the actual API response shapes.
 */
import { SpaceRole } from '@api/space-user/space-role.enum';

// Re-export SpaceRole for convenience
export { SpaceRole };

// Import DTOs from API - these are the source of truth for request payloads
export type { SpaceUserInviteDto } from '@api/space-user/dtos';
export type { SpaceUserUpdateRoleDto } from '@api/space-user/dtos';

// Re-export with aliases for backward compatibility
export type { SpaceUserInviteDto as InviteSpaceUserDto } from '@api/space-user/dtos';
export type { SpaceUserUpdateRoleDto as UpdateSpaceUserRoleDto } from '@api/space-user/dtos';

// Import entity types from API
export type { PublicSpaceUser } from '@api/space-user/space-user.entity';

/**
 * SpaceUser response interface - represents what the API returns.
 * Includes nested user details that get populated by the API.
 */
export interface SpaceUser {
	id: string;
	spaceId: string;
	userId: string;
	role: SpaceRole;
	user?: {
		id: string;
		email: string;
		firstName?: string;
		lastName?: string;
	};
	createdAt: string;
	updatedAt: string;
}
