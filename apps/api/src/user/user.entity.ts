import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	Unique,
	ManyToOne,
	JoinColumn,
	OneToMany,
	Index,
	JoinTable,
} from 'typeorm';
import { IsNotEmpty, IsString } from 'class-validator';

import { Organization } from '../organization/organization.entity';
import { AuthenticationStrategy } from '../authentication-strategy/authentication-strategy.entity';
import { SpaceUser } from '../space-user/space-user.entity';

import { Utils as UserUtils } from './user.utils';
import { OktaOauthToken } from './dtos/okta-login-request.dto';
import { Permission, PublicPermission } from './permission/permission.entity';
import { UserRole } from './user-role.enum';


// import { ExamplePermission } from '../examples/example-permission.entity';

export enum ActivationStatus {
	Pending = 'pending',
	Activated = 'activated',
}

export const UserRoleMap = Object.entries(UserRole).reduce<Record<string, number>>((acc, cur, idx) => {
	acc[cur[1]] = idx;
	return acc;
}, {});

export interface Profile {
	nameFirst: string;
	nameLast: string;
}

export class PublicProfile {
	@IsNotEmpty()
	@IsString()
	nameFirst!: string;

	@IsNotEmpty()
	@IsString()
	nameLast!: string;
}

export type PublicUser = Pick<User, 'id' | 'email'> & {
	nameFirst?: string;
	nameLast?: string;
	//examplePermissions?: ExamplePermission[]
	deactivated: boolean;
	email: string;
	role: UserRole;
	// authenticationStrategyId: string;
	// authenticationStrategy: PublicAuthenticationStrategy;
	profile: {
		nameFirst: string;
		nameLast: string;
	};
};

export type PublicUserWithPermissions = PublicUser & {
	permissions: PublicPermission[];
};

@Entity('users')
@Unique(['emailNormalized', 'organization'])
export class User {
	[key: string]: unknown;

	constructor(
		value?: Partial<User>,
		_privateProfile?: string,
		keepNulls: boolean = false,
	) {
		if (value) {
			value = structuredClone(value);
		}
		for (const k in value) {
			(this as Record<string, unknown>)[k] = value[k];
		}
		if (_privateProfile) {
			this._privateProfile = _privateProfile;
		}
		if (!keepNulls) {
			this.stripNulls();
		}
	}

	@PrimaryGeneratedColumn('uuid')
	@Index()
	id: string | null = null;

	@Column('text')
	email: string | null = null;

	@Column('text')
	emailNormalized: string | null = null;

	@Column('text')
	organizationId: string | null = null;
	@ManyToOne(() => Organization, (organization) => organization.id, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'organizationId' })
	organization!: Organization | Partial<Organization>;

	@Column({
		type: 'enum',
		enum: UserRole,
	})
	role: UserRole | null = null;

	@Column({ type: 'timestamptz', default: () => 'NOW()' })
	created: string | null = null;

	@Column({
		type: 'enum',
		enum: ActivationStatus,
		default: ActivationStatus.Pending,
	})
	activationStatus: ActivationStatus | null = null;

	@Column({ type: 'boolean', default: false })
	deactivated: boolean | null = null;

	@Column('text', { nullable: true })
	singlePass: string | null = null;

	@Column('timestamptz', { nullable: true })
	singlePassExpire: string | null = null;

	@Column('uuid', { nullable: true })
	authenticationStrategyId?: string | null = null;
	@ManyToOne(() => AuthenticationStrategy, {
		nullable: true,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'authenticationStrategyId' })
	authenticationStrategy?:
		| AuthenticationStrategy
		| Partial<AuthenticationStrategy>;

	@Column('text', { array: true, nullable: true })
	authTokens: string[] | null = null;

	oktaOauthToken?: OktaOauthToken | null = null;

	@Column('text', { nullable: true })
	authChallenge?: string;

	@Column({ type: 'timestamptz', default: () => 'NOW()' })
	lastSeen: string | null = null;

	@Column('text', {
		name: 'privateProfile',
		nullable: true,
	})
	private _privateProfile: string | null = null;
	public get privateProfile(): Profile {
		return UserUtils.decryptProfile(
			this._privateProfile ?? '',
			this.id ?? '',
		);
	}
	public set privateProfile(value: Profile) {
		this._privateProfile =
			UserUtils.encryptProfile(value, this.id ?? '') ?? null;
	}

	@Column('jsonb', {
		nullable: true,
		default: {},
	})
	profile: PublicProfile | null = null;

	@OneToMany(() => Permission, (permission) => permission.user, {
		nullable: true,
		cascade: true,
		onDelete: 'CASCADE',
	})
	permissions?: Permission[] | Partial<Permission>[] | null = null;

	@OneToMany(() => SpaceUser, (spaceUser) => spaceUser.user, {
		cascade: true,
	})
	@JoinTable({ name: 'spaceUsers' })
	public userSpaces?: SpaceUser[] | Partial<SpaceUser[]>;

	public toPublic(_excludes: (keyof User)[] = []): PublicUser {
		const pub: Partial<PublicUser> = {
			id: this.id ?? undefined,
			email: this.email ?? '',
			nameFirst: this.profile?.nameFirst,
			nameLast: this.profile?.nameLast,
			deactivated: this.deactivated ?? false,
			//authenticationStrategyId: this.authenticationStrategyId,
			role: this.role ?? undefined,
			profile: this.profile ?? { nameFirst: '', nameLast: '' },
		};

		// if(this.authenticationStrategy && !excludes.includes('authenticationStrategy')) {
		// 	pub.authenticationStrategy = new AuthenticationStrategy(
		// 		this.authenticationStrategy
		// 	).toPublic();
		// }

		return pub as PublicUser;
	}

	public toAdmin(): PublicUserWithPermissions {
		const pub = this.toPublic();
		const permissions = (this.permissions ?? []).map((permission) => {
			return (permission as Permission).toPublic();
		});
		return { ...pub, permissions } as PublicUserWithPermissions;
	}

	public clean(): User {
		const keys = Object.keys(new User(undefined, undefined, true));
		const toDelete: string[] = [];
		for (const key of Object.keys(this)) {
			if (!keys.includes(key)) {
				toDelete.push(key);
			}
		}
		for (const key of toDelete) {
			delete (this as Record<string, unknown>)[key];
		}

		return this;
	}

	public stripNulls(): User {
		for (const [k, _v] of Object.entries(this)) {
			if ((this as Record<string, unknown>)[k] === null) {
				delete (this as Record<string, unknown>)[k];
			}
		}
		return this;
	}
}
