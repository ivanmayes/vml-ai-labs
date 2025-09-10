import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn
} from 'typeorm';
import { Organization } from '../organization/organization.entity';

export const KEY_SIZE_BYTES = 128;

@Entity('apiKeys')
@Index(['key'], { unique: true })
export class ApiKey {
	constructor(value?: Partial<ApiKey>) {
		value = structuredClone(value);
		for(const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('text')
	name: string;

	@Column('text')
	key: string;
	keyDecrypted?: string;

	@Column('uuid')
	organizationId: string;
	@ManyToOne(
		() => Organization,
		{
			nullable: false
		}
	)
	@JoinColumn({ name: 'organizationId' })
	organization: Organization;

	@Column('boolean', { nullable: false, default: false })
	revoked: boolean;

	@Column('timestamptz', { nullable: true })
	expires?: string;

	@Column('timestamptz', { default: () => 'NOW()' })
	created: string;
}