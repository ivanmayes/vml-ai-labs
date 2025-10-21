import { Column, Entity, PrimaryGeneratedColumn, Index, OneToMany, OneToOne, ManyToOne, JoinColumn } from 'typeorm';
import {
	AuthenticationStrategy,
	PublicAuthenticationStrategy
} from '../authentication-strategy/authentication-strategy.entity';

import { User } from '../user/user.entity';

import { UpdateOrgSettingsDto } from './dtos/update-org-settings.dto';
//import { NotificationConfig } from '../notification/models';

export interface LogoAsset {
	url: string;
}

export type PublicOrganization = Pick<
	Organization,
	'id' | 'name' | 'slug' | 'settings' | 'created' | 'redirectToSpace'
> & {
	authenticationStrategies?: PublicAuthenticationStrategy[];
};

@Entity('organizations')
@Index(['slug'], { unique: true })
export class Organization {
	constructor(value?: Partial<Organization>) {
		if(value) {
			value = structuredClone(value);
		}
		for(const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('text', {
		nullable: false
	})
	name: string;

	@Column('text', {
		nullable: false
	})
	slug: string;

	@Column('boolean', {
		nullable: false,
		default: false
	})
	enabled: boolean;

	@Column('boolean', {
		nullable: false,
		default: false
	})
	redirectToSpace: boolean;

	@OneToMany(
		() => AuthenticationStrategy,
		authenticationStrategy => authenticationStrategy.organizationId,
		{
			eager: false
		}
	)
	authenticationStrategies?: AuthenticationStrategy[];

	@Column('text', { nullable: true })
	defaultAuthenticationStrategyId?: string;
	@ManyToOne(
		() => AuthenticationStrategy,
		authenticationStrategy => authenticationStrategy.id,
		{
			//onDelete: 'CASCADE',
			nullable: true
		}
	)
	@JoinColumn({ name: 'defaultAuthenticationStrategyId' })
	defaultAuthenticationStrategy?: AuthenticationStrategy;

	@OneToMany(
		() => User,
		user => user.organization,
		{
			eager: false
		}
	)
	users: User[];

	@Column('jsonb', { nullable: true })
	settings?: UpdateOrgSettingsDto;

	// TODO: Add support for org-specific notification providers
	// @Column('text', { nullable: true})
	// notificationConfig: string;
	// notificationConfigDecrypted?: NotificationConfig;

	@Column({ type: 'timestamptz', default: () => 'NOW()' })
	created: string;

	public toPublic(
		include: Array<keyof Organization> = [],
		exclude: Array<keyof Organization> = []
	): PublicOrganization {
		const pub: Partial<PublicOrganization> = {
			id: this.id,
			name: this.name,
			slug: this.slug,
			settings: this.settings,
			created: this.created,
			redirectToSpace: this.redirectToSpace ?? false
		};

		if(
			include?.includes('authenticationStrategies') &&
			this.authenticationStrategies?.length
		) {
			pub.authenticationStrategies = (
				this.authenticationStrategies as AuthenticationStrategy[]
			)?.map(a => new AuthenticationStrategy(a)
				.toPublic());
		}

		if(exclude.includes('created')) {
			delete pub.created;
		}

		return pub as PublicOrganization;
	}
}
