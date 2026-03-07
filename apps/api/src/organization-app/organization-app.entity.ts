import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';

import { Organization } from '../organization/organization.entity';

export type PublicOrganizationApp = Pick<
	OrganizationApp,
	| 'id'
	| 'organizationId'
	| 'appKey'
	| 'enabled'
	| 'settings'
	| 'createdAt'
	| 'updatedAt'
>;

@Entity({ name: 'organization_apps', schema: 'public' })
@Index(['organizationId'])
@Index(['organizationId', 'appKey'], { unique: true })
export class OrganizationApp {
	[key: string]: unknown;

	constructor(value?: Partial<OrganizationApp>) {
		if (value) {
			value = structuredClone(value);
		}
		for (const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('text')
	organizationId!: string;
	@ManyToOne(() => Organization, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'organizationId' })
	organization!: Organization | Partial<Organization>;

	@Column('text', {
		nullable: false,
	})
	appKey!: string;

	@Column('boolean', {
		default: true,
	})
	enabled!: boolean;

	@Column('jsonb', {
		default: {},
	})
	settings!: Record<string, any>;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: string;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: string;

	public toPublic(): PublicOrganizationApp {
		return {
			id: this.id,
			organizationId: this.organizationId,
			appKey: this.appKey,
			enabled: this.enabled,
			settings: this.settings,
			createdAt: this.createdAt,
			updatedAt: this.updatedAt,
		};
	}
}
