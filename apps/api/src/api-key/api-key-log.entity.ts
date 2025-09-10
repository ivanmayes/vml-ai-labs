import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn
} from 'typeorm';
import { ApiKey } from './api-key.entity';
import { RequestEnvelope } from '../_core/models';

export type PublicApiKeyLog = Pick<ApiKeyLog,
	'id'
> & {
	// Other Public Properties
}

@Entity('apiKeyLogs')
export class ApiKeyLog {
	constructor(value?: Partial<ApiKeyLog>) {
		value = structuredClone(value);
		for(const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('uuid')
	apiKeyId: string;
	@ManyToOne(
		() => ApiKey,
		{
			nullable: false
		}
	)
	@JoinColumn({ name: 'apiKeyId' })
	apiKey: ApiKey;

	@Column('text')
	endpoint?: string;

	@Column('jsonb')
	meta?: RequestEnvelope['meta'];

	@Column('timestamptz', { default: () => 'NOW()' })
	created: string;

	public toPublic() {
		const pub: Partial<PublicApiKeyLog> = {
			id: this.id
		};

		// Other public transformations

		return pub as PublicApiKeyLog;
	}
}