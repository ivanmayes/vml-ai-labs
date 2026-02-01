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

import { Space } from '../space/space.entity';
import { User } from '../user/user.entity';

import { SpaceRole } from './space-role.enum';

export type PublicSpaceUser = Pick<
	SpaceUser,
	'id' | 'spaceId' | 'userId' | 'role' | 'createdAt' | 'updatedAt'
>;

@Entity('space_users')
@Index(['spaceId'])
@Index(['userId'])
@Index(['spaceId', 'userId'], { unique: true })
export class SpaceUser {
	[key: string]: unknown;

	constructor(value?: Partial<SpaceUser>) {
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
	spaceId!: string;
	@ManyToOne(() => Space, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'spaceId' })
	space!: Space | Partial<Space>;

	@Column('text')
	userId!: string;
	@ManyToOne(() => User, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'userId' })
	user!: User | Partial<User>;

	@Column({
		type: 'enum',
		enum: SpaceRole,
		default: SpaceRole.SpaceUser,
	})
	role!: SpaceRole;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: string;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: string;

	public toPublic(): PublicSpaceUser {
		return {
			id: this.id,
			spaceId: this.spaceId,
			userId: this.userId,
			role: this.role,
			createdAt: this.createdAt,
			updatedAt: this.updatedAt,
		};
	}
}
