import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	Unique,
	ManyToOne,
	JoinColumn,
	OneToMany,
	Index,
	ManyToMany,
	JoinTable
} from 'typeorm';

import { Utils as UserUtils } from './user.utils';
import { Organization } from '../organization/organization.entity';
import {
	AuthenticationStrategy,
	PublicAuthenticationStrategy
} from '../authentication-strategy/authentication-strategy.entity';
import { OktaOauthToken } from './dtos/okta-login-request.dto';
import { IsNotEmpty, IsString } from 'class-validator';
import { Permission, PublicPermission } from './permission/permission.entity';
import { UserRole } from './user-role.enum';

// import { ExamplePermission } from '../examples/example-permission.entity';

export enum ActivationStatus {
	Pending = 'pending',
	Activated = 'activated'
}

export const UserRoleMap = Object.entries(UserRole)
	.reduce((acc, cur, idx) => {
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
	nameFirst: string;

	@IsNotEmpty()
	@IsString()
	nameLast: string;
}

export type PublicUser = Pick<User, 'id' | 'email'> & {
	nameFirst?: string;
	nameLast?: string;
	//examplePermissions?: ExamplePermission[]
	// deactivated: boolean;
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
	constructor(value?: Partial<User>, _privateProfile?: string, keepNulls: boolean = false) {
		if(value) {
			value = structuredClone(value);
		}
		for(const k in value) {
			this[k] = value[k];
		}
		if(_privateProfile) {
			this._privateProfile = _privateProfile;
		}
		if(!keepNulls) {
			this.stripNulls();
		}
	}

	@PrimaryGeneratedColumn('uuid')
	@Index()
	id: string = null;

	@Column('text')
	email: string = null;

	@Column('text')
	emailNormalized: string = null;

	@Column('text')
	organizationId: string = null;
	@ManyToOne(() => Organization, organization => organization.id, {
		onDelete: 'CASCADE'
	})
	@JoinColumn({ name: 'organizationId' })
	organization: Organization | Partial<Organization>;

	@Column({
		type: 'enum',
		enum: UserRole
	})
	role: UserRole = null;

	@Column({ type: 'timestamptz', default: () => 'NOW()' })
	created: string = null;

	@Column({
		type: 'enum',
		enum: ActivationStatus,
		default: ActivationStatus.Pending
	})
	activationStatus: ActivationStatus = null;

	@Column({ type: 'boolean', default: false })
	deactivated: boolean = null;

	@Column('text', { nullable: true })
	singlePass: string = null;

	@Column('timestamptz', { nullable: true })
	singlePassExpire: string = null;

	@Column('uuid', { nullable: false })
	authenticationStrategyId: string = null;
	@ManyToOne(
		() => AuthenticationStrategy,
		{
			nullable: false,
			onDelete: 'CASCADE'
		}
	)
	@JoinColumn({ name: 'authenticationStrategyId' })
	authenticationStrategy: AuthenticationStrategy | Partial<AuthenticationStrategy>;

	@Column('text', { array: true, nullable: true })
	authTokens: string[] = null;

	oktaOauthToken?: OktaOauthToken = null;

	@Column({ type: 'timestamptz', default: () => 'NOW()' })
	lastSeen: string = null;

	@Column('text', {
		name: 'privateProfile',
		nullable: true
	})
	private _privateProfile: string = null;
	public get privateProfile(): Profile {
		return UserUtils.decryptProfile(this._privateProfile, this.id);
	}
	public set privateProfile(value: Profile) {
		this._privateProfile = UserUtils.encryptProfile(value, this.id);
	}

	@Column('jsonb', {
		nullable: true,
		default: {}
	})
	profile: PublicProfile = null;

	@OneToMany(
		() => Permission,
		permission => permission.user,
		{
			nullable: true,
			cascade: true,
			onDelete: 'CASCADE'
		}
	)
	permissions?: Permission[] | Partial<Permission>[] = null;

	@Column('text', { nullable: true })
	authChallenge?: string;

	public toPublic(excludes: Array<keyof User> = []): PublicUser {
		const pub: Partial<PublicUser> = {
			id: this.id,
			email: this.email,
			nameFirst: this.profile?.nameFirst,
			nameLast: this.profile?.nameLast,
			//deactivated: this.deactivated,
			//authenticationStrategyId: this.authenticationStrategyId,
			role: this.role,
			profile: this.profile
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
		const permissions = this.permissions.map(permission => {
			return (permission as Permission).toPublic();
		});
		return {...pub, permissions} as PublicUserWithPermissions;
	}

	public clean(): User {
		const keys = Object.keys(new User(undefined, undefined, true));
		const toDelete: string[] = [];
		for(const key of Object.keys(this)) {
			if(!keys.includes(key)) {
				toDelete.push(key);
			}
		}
		for(const key of toDelete) {
			delete this[key];
		}

		return this;
	}

	public stripNulls(): User {
		for(const [k, v] of Object.entries(this)) {
			if(this[k] === null) {
				delete this[k];
			}
		}
		return this;
	}
}
