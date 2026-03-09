import { Organization } from '../../organization/organization.entity';
import { User } from '../../user/user.entity';
import { Space } from '../../space/space.entity';
import { Project } from '../../project/project.entity';
import { UserRole } from '../../user/user-role.enum';

import {
	createTestOrg,
	createTestUser,
	createTestSpace,
	createTestProject,
} from './test-helpers';

describe('Shared Entity Contracts', () => {
	describe('Organization', () => {
		it('should have toPublic method', () => {
			const data = createTestOrg();
			const org = new Organization(data as Partial<Organization>);
			expect(typeof org.toPublic).toBe('function');
		});

		it('toPublic should return expected shape', () => {
			const data = createTestOrg({
				id: 'org-123',
				name: 'Acme Corp',
				slug: 'acme-corp',
			});
			const org = new Organization(data as Partial<Organization>);
			const pub = org.toPublic();

			expect(pub).toHaveProperty('id', 'org-123');
			expect(pub).toHaveProperty('name', 'Acme Corp');
			expect(pub).toHaveProperty('slug', 'acme-corp');
			expect(pub).toHaveProperty('settings');
			expect(pub).toHaveProperty('created');
			expect(pub).toHaveProperty('redirectToSpace');
		});

		it('toPublic should not expose sensitive fields', () => {
			const data = createTestOrg({ enabled: true });
			const org = new Organization(data as Partial<Organization>);
			const pub = org.toPublic();

			expect(pub).not.toHaveProperty('enabled');
			expect(pub).not.toHaveProperty('users');
			expect(pub).not.toHaveProperty('defaultAuthenticationStrategyId');
		});

		it('toPublic should support exclude parameter', () => {
			const data = createTestOrg();
			const org = new Organization(data as Partial<Organization>);
			const pub = org.toPublic([], ['created']);

			expect(pub).not.toHaveProperty('created');
		});
	});

	describe('User', () => {
		it('should have toPublic method', () => {
			const orgData = createTestOrg();
			const userData = createTestUser(orgData.id, {
				role: UserRole.Admin,
			});
			const user = new User(userData as Partial<User>);
			expect(typeof user.toPublic).toBe('function');
		});

		it('toPublic should return expected shape', () => {
			const orgData = createTestOrg();
			const userData = createTestUser(orgData.id, {
				id: 'user-123',
				email: 'jane@example.com',
				role: UserRole.Admin,
				deactivated: false,
				profile: { nameFirst: 'Jane', nameLast: 'Doe' },
			});
			const user = new User(userData as Partial<User>);
			const pub = user.toPublic();

			expect(pub).toHaveProperty('id', 'user-123');
			expect(pub).toHaveProperty('email', 'jane@example.com');
			expect(pub).toHaveProperty('role', UserRole.Admin);
			expect(pub).toHaveProperty('deactivated', false);
			expect(pub).toHaveProperty('profile');
			expect(pub.profile).toEqual({ nameFirst: 'Jane', nameLast: 'Doe' });
		});

		it('toPublic should not expose sensitive fields', () => {
			const orgData = createTestOrg();
			const userData = createTestUser(orgData.id, {
				role: UserRole.Admin,
				singlePass: 'secret-pass',
				authTokens: ['token-1'],
				authChallenge: 'challenge',
			});
			const user = new User(userData as Partial<User>);
			const pub = user.toPublic();

			expect(pub).not.toHaveProperty('singlePass');
			expect(pub).not.toHaveProperty('singlePassExpire');
			expect(pub).not.toHaveProperty('authTokens');
			expect(pub).not.toHaveProperty('authChallenge');
			expect(pub).not.toHaveProperty('organizationId');
			expect(pub).not.toHaveProperty('emailNormalized');
		});

		it('should have toAdmin method', () => {
			const orgData = createTestOrg();
			const userData = createTestUser(orgData.id, {
				role: UserRole.Admin,
				permissions: [],
			});
			const user = new User(userData as Partial<User>);
			expect(typeof user.toAdmin).toBe('function');
		});

		it('toAdmin should include permissions', () => {
			const orgData = createTestOrg();
			const userData = createTestUser(orgData.id, {
				role: UserRole.Admin,
				permissions: [],
			});
			const user = new User(userData as Partial<User>);
			const admin = user.toAdmin();

			expect(admin).toHaveProperty('permissions');
			expect(Array.isArray(admin.permissions)).toBe(true);
		});
	});

	describe('Space', () => {
		it('should have toPublic method', () => {
			const orgData = createTestOrg();
			const spaceData = createTestSpace(orgData.id);
			const space = new Space(spaceData as Partial<Space>);
			expect(typeof space.toPublic).toBe('function');
		});

		it('toPublic should return expected shape', () => {
			const orgData = createTestOrg();
			const spaceData = createTestSpace(orgData.id, {
				id: 'space-123',
				name: 'Main Space',
				isPublic: true,
				settings: { theme: 'dark' },
				approvedWPPOpenTenantIds: ['tenant-1'],
			});
			const space = new Space(spaceData as Partial<Space>);
			const pub = space.toPublic();

			expect(pub).toHaveProperty('id', 'space-123');
			expect(pub).toHaveProperty('name', 'Main Space');
			expect(pub).toHaveProperty('created');
			expect(pub).toHaveProperty('isPublic', true);
			expect(pub).toHaveProperty('settings');
			expect(pub.settings).toEqual({ theme: 'dark' });
			expect(pub).toHaveProperty('approvedWPPOpenTenantIds');
			expect(pub.approvedWPPOpenTenantIds).toEqual(['tenant-1']);
		});

		it('toPublic should not expose internal fields', () => {
			const orgData = createTestOrg();
			const spaceData = createTestSpace(orgData.id);
			const space = new Space(spaceData as Partial<Space>);
			const pub = space.toPublic();

			expect(pub).not.toHaveProperty('organizationId');
			expect(pub).not.toHaveProperty('organization');
		});

		it('should have toMinimal method', () => {
			const orgData = createTestOrg();
			const spaceData = createTestSpace(orgData.id, {
				id: 'space-456',
				name: 'Minimal Space',
			});
			const space = new Space(spaceData as Partial<Space>);
			expect(typeof space.toMinimal).toBe('function');

			const minimal = space.toMinimal();
			expect(minimal).toHaveProperty('id', 'space-456');
			expect(minimal).toHaveProperty('name', 'Minimal Space');
			expect(minimal).toHaveProperty('created');
			expect(minimal).toHaveProperty('isPublic');
			expect(minimal).not.toHaveProperty('settings');
			expect(minimal).not.toHaveProperty('approvedWPPOpenTenantIds');
		});
	});

	describe('Project', () => {
		it('should have toPublic method', () => {
			const orgData = createTestOrg();
			const spaceData = createTestSpace(orgData.id);
			const projectData = createTestProject(orgData.id, spaceData.id);
			const project = new Project(projectData as Partial<Project>);
			expect(typeof project.toPublic).toBe('function');
		});

		it('toPublic should return expected shape', () => {
			const orgData = createTestOrg();
			const spaceData = createTestSpace(orgData.id);
			const projectData = createTestProject(orgData.id, spaceData.id, {
				id: 'proj-123',
				name: 'My Project',
				description: 'A test project',
				settings: { color: 'blue' },
				createdById: 'user-1',
			});
			const project = new Project(projectData as Partial<Project>);
			const pub = project.toPublic();

			expect(pub).toHaveProperty('id', 'proj-123');
			expect(pub).toHaveProperty('name', 'My Project');
			expect(pub).toHaveProperty('description', 'A test project');
			expect(pub).toHaveProperty('settings');
			expect(pub.settings).toEqual({ color: 'blue' });
			expect(pub).toHaveProperty('organizationId');
			expect(pub).toHaveProperty('spaceId');
			expect(pub).toHaveProperty('createdById', 'user-1');
			expect(pub).toHaveProperty('createdAt');
			expect(pub).toHaveProperty('updatedAt');
		});

		it('toPublic should not expose relation objects', () => {
			const orgData = createTestOrg();
			const spaceData = createTestSpace(orgData.id);
			const projectData = createTestProject(orgData.id, spaceData.id);
			const project = new Project(projectData as Partial<Project>);
			const pub = project.toPublic();

			expect(pub).not.toHaveProperty('organization');
			expect(pub).not.toHaveProperty('space');
			expect(pub).not.toHaveProperty('createdBy');
		});
	});

	describe('Entity constructors', () => {
		it('Organization should accept partial data', () => {
			const org = new Organization({ name: 'Partial Org' });
			expect(org.name).toBe('Partial Org');
		});

		it('User should accept partial data', () => {
			const user = new User({ email: 'partial@example.com' });
			expect(user.email).toBe('partial@example.com');
		});

		it('Space should accept partial data', () => {
			const space = new Space({ name: 'Partial Space' });
			expect(space.name).toBe('Partial Space');
		});

		it('Project should accept partial data', () => {
			const project = new Project({ name: 'Partial Project' });
			expect(project.name).toBe('Partial Project');
		});
	});
});
