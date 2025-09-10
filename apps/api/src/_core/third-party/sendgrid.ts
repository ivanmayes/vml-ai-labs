/**
 * NPM Modules
 */
import sgMail from '@sendgrid/mail';

export class Email {
	name?: string;
	address: string;
}

export class SendGridConfig {
	apiKey: string | 'SYSTEM';
}
export class SendGrid {
	private static config = {
		apiKey: process.env.SENDGRID_API_KEY
	};

	public static async send(
		to: string | Email[],
		from: string,
		mergeTags: Record<string, string>,
		subject?: string,
		templateId?: string,
		messageHtml?: string,
		messageText?: string,
		bcc?: string | Email[],
		configOverride?: SendGridConfig
	) {
		if(configOverride?.apiKey === 'SYSTEM') {
			configOverride.apiKey = process.env.SENDGRID_API_KEY;
		}
		let config = { ...this.config, ...(configOverride || {}) };
		if (!config.apiKey) {
			throw 'Sendgrid is not properly configured.';
		} else {
			sgMail.setApiKey(config.apiKey);
		}

		let email: any = {
			from: from,
			dynamicTemplateData: mergeTags
		};

		if (Array.isArray(to)) {
			email.to = to.map(t => t.address);
		} else {
			email.to = to;
		}

		if (subject?.length) {
			email.subject = subject;
		}

		if (templateId) {
			email.templateId = templateId;
		}

		if (messageHtml?.length) {
			email.html = messageHtml;
		}

		if (messageText?.length) {
			email.text = messageText;
		}

		if (Array.isArray(bcc)) {
			email.bcc = bcc.map(t => t.address);
		} else if (bcc) {
			email.bcc = bcc;
		}

		return sgMail.send(email);
	}
}
