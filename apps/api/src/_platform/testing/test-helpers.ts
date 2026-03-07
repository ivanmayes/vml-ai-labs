import { Test, TestingModule } from '@nestjs/testing';
import { ModuleMetadata } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { UserRole } from '../../user/user-role.enum';
import type { Organization } from '../../organization/organization.entity';
import type { User } from '../../user/user.entity';
import type { Space } from '../../space/space.entity';
import type { Project } from '../../project/project.entity';

export type TestOrgData = Partial<Organization> & { id: string };
export type TestUserData = Partial<User> & { id: string };
export type TestSpaceData = Partial<Space> & { id: string };
export type TestProjectData = Partial<Project> & { id: string };

export function createTestOrg(
	overrides: Partial<Organization> = {},
): TestOrgData {
	return {
		id: uuidv4(),
		name: 'Test Organization',
		slug: 'test-org',
		enabled: true,
		redirectToSpace: false,
		created: new Date().toISOString(),
		settings: {},
		...overrides,
	} as TestOrgData;
}

export function createTestUser(
	orgId: string,
	overrides: Partial<User> = {},
): TestUserData {
	return {
		id: uuidv4(),
		email: 'test@example.com',
		emailNormalized: 'test@example.com',
		organizationId: orgId,
		role: UserRole.Admin,
		created: new Date().toISOString(),
		activationStatus: 'activated' as const,
		deactivated: false,
		profile: { nameFirst: 'Test', nameLast: 'User' },
		...overrides,
	} as TestUserData;
}

export function createTestSpace(
	orgId: string,
	overrides: Partial<Space> = {},
): TestSpaceData {
	return {
		id: uuidv4(),
		name: 'Test Space',
		organizationId: orgId,
		created: new Date().toISOString(),
		settings: {},
		isPublic: true,
		approvedWPPOpenTenantIds: [],
		...overrides,
	} as TestSpaceData;
}

export function createTestProject(
	orgId: string,
	spaceId: string,
	overrides: Partial<Project> = {},
): TestProjectData {
	return {
		id: uuidv4(),
		name: 'Test Project',
		organizationId: orgId,
		spaceId: spaceId,
		settings: {},
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	} as TestProjectData;
}

export function mockAuthGuard() {
	return {
		canActivate: () => true,
	};
}

export async function createTestModule(
	metadata: ModuleMetadata,
): Promise<TestingModule> {
	return Test.createTestingModule({
		imports: [...(metadata.imports || [])],
		providers: [...(metadata.providers || [])],
		controllers: [...(metadata.controllers || [])],
	}).compile();
}
