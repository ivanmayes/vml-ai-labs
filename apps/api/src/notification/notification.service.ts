import { promises as fs } from 'fs';
import path from 'path';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';

import Handlebars from 'handlebars';

import { SES, Email } from '../_core/third-party/aws';

import { Config } from '../app.config';

import { Utils } from './notification.utils';
import { Notification } from './notification.entity';
import { NotificationTemplate } from './notification-template';
import { NotificationProvider, NotificationType, NotificationConfig } from './models';
import { SendGrid, SendGridConfig } from '../_core/third-party/sendgrid';
import { AJO } from '../_core/third-party/adobe';
import { Locale } from '../_core/models/locale';
import { AJOConfig } from '../_core/third-party/adobe/adobe.ajo';

export interface Recipients {
	to?: string | Email[];
	cc?: string | Email[];
	bcc?: string | Email[];
}

@Injectable()
export class NotificationService {
	constructor(
		@InjectRepository(Notification)
		private readonly notificationRepository: Repository<Notification>
	) {
		this.loadGlobalTemplates()
			// .then(() => {
			// 	this.test().catch(err => null);
			// })
			.catch(err => {
				console.log(err);
			});
	}

	public async sendTemplate(
		templateSlug: string,
		organizationId: string,
		recipients: Recipients,
		mergeTags: Record<string, string>,
		campaignId?: string,
		config?: NotificationConfig,
		locale: Locale = Locale.enUS,
		organizationName?: string
	) {
		let where: FindOptionsWhere<Notification>[] = [
			{
				slug: templateSlug,
				organizationId
			},
			{
				slug: templateSlug,
				organizationId: IsNull()
			}
		];

		if(campaignId) {
			where = [
				{
					slug: templateSlug,
					organizationId
				},
				{
					slug: templateSlug,
					organizationId: IsNull()
				}
			];
		}

		const templates: Notification[] = await this.notificationRepository
			.find({
				where
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!templates) {
			throw new Error(`No template found matching slug ${templateSlug}.`);
		}

		if(!templates.some(t => t.slug === templateSlug)) {
			throw new Error(`No template found matching slug ${templateSlug}.`);
		}

		if(!config || config?.type === NotificationType.Email) {
			return this.sendEmail(templates, organizationId, recipients, mergeTags, campaignId, config, locale, organizationName);
		} else {
			throw new Error(`Notification type ${config.type} not implemented.`)
		}
	}

	private async sendEmail(
		templates: Notification[],
		organizationId: string,
		recipients: Recipients,
		mergeTags: Record<string, string>,
		campaignId?: string,
		config?: NotificationConfig,
		locale: Locale = Locale.enUS,
		organizationName?: string
	) {
		let template: Notification;

		// Get as specific as we can.
		if(campaignId) {
			template = templates.find(t => t.organizationId === organizationId && locale === t.locale);
			if(!template) {
				template = templates.find(t => t.organizationId === organizationId && t.locale === Locale.enUS);
			}
		}

		if(!template) {
			template = templates.find(t => t.organizationId === organizationId && locale === t.locale);
			if(!template) {
				template = templates.find(t => t.organizationId === organizationId && t.locale === Locale.enUS);
			}
		}

		if(!template) {
			template = templates.find(t => t.organizationId === null && locale === t.locale);
			if(!template) {
				template = templates.find(t => t.organizationId === null && t.locale === Locale.enUS);
			}
		}

		if(!template) {
			throw new Error(`No template found matching slug ${template.slug}.`);
		}

		// System default provider.
		let provider: NotificationProvider = NotificationProvider.SES;
		if(config?.provider) {
			provider = config.provider;
		}

		// Use system default sender or config override.
		let sender = Config.system.email.name + ` <${Config.system.email.address}>`;
		if(organizationName) {
			sender = organizationName + ` <${Config.system.email.address}>`;
		}
		if(config?.emailFrom) {
			sender = config.emailFrom;
		}

		// Override standard merge tag definitions.
		if(template.mergeTagMap) {
			let newTags = {};
			for(const key in mergeTags) {
				if(template.mergeTagMap[key] && mergeTags[key]) {
					newTags[template.mergeTagMap[key]] = mergeTags[key];
				}
			}
			mergeTags = newTags;
		}

		if(template.subject) {
			template.subject = Handlebars.compile(template.subject)(mergeTags);
		}
		if(template.templateHtml) {
			template.templateHtml = Handlebars.compile(template.templateHtml)(mergeTags);
		}
		if(template.templateText) {
			template.templateText = Handlebars.compile(template.templateText)(mergeTags);
		}
		// Insert any global BCC addresses.
		let bcc = recipients?.bcc || [];
		if(config?.emailBcc?.length) {
			if(!Array.isArray(bcc)) {
				bcc = [{ name: null, address: bcc }];
			}
			bcc.push(...config.emailBcc.map(e => ({ name: null, address: e })));
		}

		if(provider === NotificationProvider.SES) {
			return SES.sendRaw(
				recipients.to,
				sender,
				template.subject,
				template.templateText,
				template.templateHtml,
				null,
				recipients.cc,
				bcc
			);
		} else if(provider === NotificationProvider.Sendgrid) {

			return SendGrid
				.send(
					recipients.to,
					sender,
					mergeTags,
					template.subject,
					template.templateRemoteId,
					template.templateHtml,
					template.templateText,
					bcc,
					config?.providerConfig as SendGridConfig
				);
		} else if(provider === NotificationProvider.AdobeJourneyOptimizer) {
			const { to, ...rest } = Utils.recipientToStringArray(recipients);
			return AJO.sendTemplate(
				config?.providerConfig as AJOConfig,
				to?.join(','),
				template.templateRemoteId,
				mergeTags
			);
		} else {
			throw new Error(`Provider ${provider} not implemented.`);
		}
	}

	private async loadGlobalTemplates() {
		const templates = await fs.readdir(path.join(__dirname, '/templates'))
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!templates) {
			return;
		}

		for(const entry of templates) {
			const templatePath = path.join(__dirname, '/templates', entry);
			if(!templatePath.match(/.template$/)) {
				continue;
			}

			const importedTemplates: typeof NotificationTemplate[] = [];

			const templateBase: typeof NotificationTemplate = await import(templatePath)
				.then(t => t.Template)
				.catch(err => {
					console.log(err);
					return null;
				});

			if(!templateBase) {
				continue;
			}

			importedTemplates.push(templateBase);

			const translations = await fs.readdir(path.join(templatePath, 'translations')).catch(err => []);
			for(const t of translations) {
				const template: typeof NotificationTemplate = await import(path.join(templatePath, 'translations', t))
					.then(t => t.Template)
					.catch(err => {
						console.log(err);
						return null;
					});

				if(!template) {
					continue;
				}

				importedTemplates.push(template);
			}

			for(const template of importedTemplates) {
				let savedTemplate = await this.notificationRepository
					.findOne({
						where: {
							slug: template.slug,
							organizationId: IsNull(),
							locale: template.locale
						}
					})
					.catch(err => {
						console.log(err);
						return null;
					});

				if(!savedTemplate) {
					await this.notificationRepository
						.save({
							slug: template.slug,
							locale: template.locale,
							subject: template.subject,
							templateHtml: template.html,
							templateText: template.text
						})
						.catch(err => {
							console.log(err);
							return null;
						});
				} else {
					savedTemplate = {
						...savedTemplate,
						locale: template.locale,
						subject: template.subject,
						templateHtml: template.html,
						templateText: template.text
					};

					await this.notificationRepository.save(savedTemplate)
						.catch(err => {
							console.log(err);
						});
				}
			}
		}
	}
}
