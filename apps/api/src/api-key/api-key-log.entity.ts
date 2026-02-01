import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
} from 'typeorm';

import { RequestEnvelope } from '../_core/models';

import { ApiKey } from './api-key.entity';

export type PublicApiKeyLog = Pick<ApiKeyLog, 'id'> & {
	// Other Public Properties
};

@Entity('apiKeyLogs')
export class ApiKeyLog {
	[key: string]: unknown;

	constructor(value?: Partial<ApiKeyLog>) {
		value = structuredClone(value);
		for (const k in value) {
			(this as Record<string, unknown>)[k] = (
				value as Record<string, unknown>
			)[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('uuid')
	apiKeyId: string;
	@ManyToOne(() => ApiKey, {
		nullable: false,
	})
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
			id: this.id,
		};

		// Other public transformations

		return pub as PublicApiKeyLog;
	}
}
