import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

import { Organization } from '../organization/organization.entity';
import { MergeTagMap, TriggerType } from './models';
import { Locale } from '../_core/models/locale';

export type PublicNotification = Pick<Notification,
	'id'
> & {
	// Other Public Properties
}

@Entity('notifications')
export class Notification {
	constructor(value?: Partial<Notification>) {
		if(value) {
			value = structuredClone(value);
		}
		for(const k in value) {
			this[k] = value[k];
		}
	}

	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('text')
	slug: string;

	@Column('enum', { enum: Locale, default: Locale.enUS })
	locale: Locale;

	@Column('text')
	subject: string;

	@Column('text', { nullable: true })
	templateHtml?: string;

	@Column('text', { nullable: true })
	templateText?: string;

	@Column('text', { nullable: true })
	templateRemoteId?: string;

	@Column('uuid', { nullable: true })
	organizationId: string;
	@ManyToOne(() => Organization, organization => organization.id, {
		onDelete: 'CASCADE',
		nullable: true
	})
	@JoinColumn({ name: 'organizationId' })
	organization?: Organization;

	@Column('enum', {
		enum: TriggerType,
		nullable: true
	})
	triggerType: TriggerType;

	@Column('text', { nullable: true })
	triggerValue?: string;

	@Column('jsonb', { nullable: true })
	mergeTagMap: MergeTagMap;
	
	public toPublic() {
		const pub: Partial<PublicNotification> = {
			id: this.id
		};

		// Other public transformations

		return pub as PublicNotification;
	}
}
