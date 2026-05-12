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

import { User } from '../../../user/user.entity';
import { Organization } from '../../../organization/organization.entity';
import { Space } from '../../../space/space.entity';

/**
 * ImageAsset entity — per-space image storage.
 *
 * Tags are stored as a PostgreSQL `text[]` column with a GIN index
 * (added via migration; TypeORM `@Index` cannot express GIN). Filter
 * queries use `tags @> ARRAY[...]` for AND-logic containment.
 *
 * EXIF / IPTC metadata is intentionally preserved in v1 (see AGENTS.md).
 */
@Entity({ name: 'image_assets', schema: 'image_library' })
@Index('idx_il_images_space_recent', ['spaceId', 'createdAt'])
export class ImageAsset {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('uuid')
	@Index()
	organizationId: string;

	@ManyToOne(() => Organization, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'organizationId',
		foreignKeyConstraintName: 'fk_il_image_organization',
	})
	organization: Organization;

	@Column('uuid')
	spaceId: string;

	@ManyToOne(() => Space, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'spaceId',
		foreignKeyConstraintName: 'fk_il_image_space',
	})
	space: Space;

	@Column('uuid')
	userId: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'fk_il_image_user',
	})
	user: User;

	@Column({ type: 'varchar', length: 500 })
	s3Key: string;

	@Column({ type: 'varchar', length: 100 })
	mime: string;

	@Column({ type: 'int' })
	sizeBytes: number;

	@Column({ type: 'varchar', length: 255 })
	originalFilename: string;

	@Column('text', { array: true, default: () => "'{}'" })
	tags: string[];

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;
}
