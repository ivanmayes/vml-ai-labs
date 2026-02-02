import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';

import { PublicUser, User } from '../user.entity';

import { PermissionType } from './models/permission.enum';

export type PublicPermission = Pick<Permission, 'id' | 'type' | 'userId'> & {
	user?: PublicUser;
};

@Entity('permissions')
export class Permission {
	[key: string]: unknown;

	constructor(value?: Partial<Permission>) {
		if (value) {
			value = structuredClone(value);
		}
		for (const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	public id!: string;

	@Column('text')
	public userId!: string;
	@ManyToOne(() => User, (user) => user.permissions, {
		orphanedRowAction: 'delete',
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'userId' })
	public user!: User | Partial<User>;

	@Column({
		type: 'enum',
		enum: PermissionType,
	})
	public type!: PermissionType;

	public toPublic(
		_excludes: (keyof PublicPermission)[] = [],
	): PublicPermission {
		const pub: Partial<PublicPermission> = {
			id: this.id,
			userId: this.userId,
			type: this.type,
		};

		if (this.user) {
			pub.user = new User(this.user).toPublic();
		}

		return pub as PublicPermission;
	}
}
