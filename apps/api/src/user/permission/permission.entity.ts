import { Entity, Column, PrimaryGeneratedColumn, Unique, ManyToOne, JoinColumn } from 'typeorm';

import { PublicUser, User } from '../user.entity';
import { PermissionType } from './models/permission.enum';

export type PublicPermission = Pick<Permission, 
	'id' | 'type' | 'userId'
> & {
	user?: PublicUser
};

@Entity('permissions')
export class Permission {
	constructor(value?: Partial<Permission>) {
		if(value) {
			value = structuredClone(value);
		}
		for(const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	public id: string;

	@Column('text')
	public userId: string;
	@ManyToOne(
		() => User,
		user => user.permissions,
		{
			orphanedRowAction: 'delete',
			nullable: false,
			onDelete: 'CASCADE'
		}
	)
	@JoinColumn({ name: 'userId' })
	public user: User | Partial<User>;

	@Column({
		type: 'enum',
		enum: PermissionType
	})
	public type: PermissionType;

	public toPublic(excludes: Array<keyof PublicPermission> = []): PublicPermission {
		let pub: Partial<PublicPermission> = {
			id: this.id,
			userId: this.userId,
			type: this.type
		};

		if(this.user) {
			pub.user = new User(this.user).toPublic()
		}

		return pub as PublicPermission;
	}
}
