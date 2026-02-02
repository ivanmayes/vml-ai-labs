import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';

import { Organization } from '../organization/organization.entity';

export enum AuthenticationStrategyType {
	Basic = 'basic',
	Okta = 'okta',
	SAML2_0 = 'saml2.0',
}

export enum OktaUiType {
	Redirect = 'redirect',
	Widget = 'widget',
}

export enum OktaStrategy {
	OpenIDConnect = 'openIDConnect',
	OAuth2 = 'oauth2',
	SAML = 'saml',
}

export class OktaConfig {
	clientId!: string;
	oktaDomain!: string;
	strategy!: OktaStrategy;
	uiType!: OktaUiType;
}

export class BasicConfig {
	codeLength!: number;
	codeLifetime!: string;
}

export class SAML2_0Challenge {
	userId!: string;
	organizationId!: string;
	nonce!: string;
	host!: string;
	expires!: number;
}

export type PublicAuthenticationStrategy = Pick<
	AuthenticationStrategy,
	'id' | 'name' | 'type'
> & {};

@Entity('authenticationStrategies')
export class AuthenticationStrategy {
	[key: string]: unknown;

	constructor(value?: Partial<AuthenticationStrategy>) {
		for (const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('text', { nullable: false })
	name!: string;

	@Column({
		type: 'enum',
		enum: AuthenticationStrategyType,
	})
	type!: AuthenticationStrategyType;

	@Column('jsonb', { nullable: false })
	config!: BasicConfig | OktaConfig;

	@Column('text')
	organizationId!: string;
	@ManyToOne(() => Organization, (organization) => organization.id, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'organizationId' })
	organization!: Organization | Partial<Organization>;

	public toPublic(): PublicAuthenticationStrategy {
		const pub: Partial<PublicAuthenticationStrategy> = {
			id: this.id,
			name: this.name,
			type: this.type,
		};

		return pub as PublicAuthenticationStrategy;
	}
}
