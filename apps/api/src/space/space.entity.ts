import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index
} from 'typeorm';

import { Organization } from '../organization/organization.entity';

export type PublicSpace = Pick<Space, 'id' | 'name' | 'created' | 'isPublic' | 'settings'>;

export type MinimalSpace = Pick<Space, 'id' | 'name' | 'created' | 'isPublic'>;

@Entity('spaces')
@Index(['organizationId'])
export class Space {
	constructor(value?: Partial<Space>) {
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

	@Column('text')
	organizationId: string;
	@ManyToOne(() => Organization, {
		onDelete: 'CASCADE'
	})
	@JoinColumn({ name: 'organizationId' })
	organization: Organization | Partial<Organization>;

	@Column({ type: 'timestamptz', default: () => 'NOW()' })
	created: string;

	@Column('jsonb', {
		default: {}
	})
	settings: Record<string, any>;

	@Column('boolean', {
		default: true
	})
	isPublic: boolean;

	@Column('text', { array: true, default: '{}' })
	approvedWPPOpenTenantIds: string[];

	public toPublic(): PublicSpace {
		return {
			id: this.id,
			name: this.name,
			created: this.created,
			isPublic: this.isPublic,
			settings: this.settings
		};
	}

	public toMinimal(): MinimalSpace {
		return {
			id: this.id,
			name: this.name,
			created: this.created,
			isPublic: this.isPublic
		};
	}
}
