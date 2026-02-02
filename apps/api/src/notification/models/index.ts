import { AJOConfig } from '../../_core/third-party/adobe/adobe.ajo';
import { SendGridConfig } from '../../_core/third-party/sendgrid';

export enum NotificationProvider {
	SES = 'ses',
	Sendgrid = 'sendgrid',
	AdobeJourneyOptimizer = 'adobeJourneyOptimizer'
}

export enum NotificationType {
	Email = 'email',
	SMS = 'sms'
}

export enum NotificationEvent {
	Welcome = 'welcome'
}

export enum TriggerType {
	Absolute = 'absolute',
	Relative = 'relative'
}

export class NotificationTrigger {
	// Determines if the trigger should fire at a specific time or at a relative time.
	type: TriggerType;

	/*
		Values:
			- Date-parseable string if type is `absolute`.
			- Postgres time string if `relative`: '3 days'.
	*/
	value: string;
}

export type MergeTagMap = Record<NotificationEvent, MergeTag[]>

export enum MergeTag {
	UserName = 'ENTRANT_NAME',
	UserEmail = 'ENTRANT_EMAIL'
}

// TODO: Not sure if this is really valuable.
// Might just help to illustrate the merge tags available for each event.
export const NotificationEventMergeTags: MergeTagMap = {
	[NotificationEvent.Welcome]: [
		MergeTag.UserName
	]
};

export class NotificationConfig {
	type: NotificationType;
	emailFrom?: string;
	emailBcc?: string[];
	provider: NotificationProvider;
	// Used to configure third-party notification providers.
	providerConfig?: AJOConfig | SendGridConfig;
}