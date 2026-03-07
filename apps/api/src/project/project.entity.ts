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
import { Space } from '../space/space.entity';
import { User } from '../user/user.entity';

export type PublicProject = Pick<
	Project,
	| 'id'
	| 'name'
	| 'description'
	| 'settings'
	| 'organizationId'
	| 'spaceId'
	| 'createdById'
	| 'createdAt'
	| 'updatedAt'
>;

@Entity({ name: 'projects', schema: 'public' })
@Index(['organizationId'])
@Index(['spaceId'])
@Index(['organizationId', 'spaceId', 'name'], { unique: true })
export class Project {
	[key: string]: unknown;

	constructor(value?: Partial<Project>) {
		if (value) {
			value = structuredClone(value);
		}
		for (const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('text', {
		nullable: false,
	})
	name!: string;

	@Column('text', {
		nullable: true,
	})
	description!: string;

	@Column('jsonb', {
		default: {},
	})
	settings!: Record<string, any>;

	@Column('text')
	organizationId!: string;
	@ManyToOne(() => Organization, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'organizationId' })
	organization!: Organization | Partial<Organization>;

	@Column('text')
	spaceId!: string;
	@ManyToOne(() => Space, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'spaceId' })
	space!: Space | Partial<Space>;

	@Column('text', { nullable: true })
	createdById!: string;
	@ManyToOne(() => User, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	@JoinColumn({ name: 'createdById' })
	createdBy!: User | Partial<User>;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: string;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: string;

	public toPublic(): PublicProject {
		return {
			id: this.id,
			name: this.name,
			description: this.description,
			settings: this.settings,
			organizationId: this.organizationId,
			spaceId: this.spaceId,
			createdById: this.createdById,
			createdAt: this.createdAt,
			updatedAt: this.updatedAt,
		};
	}
}
