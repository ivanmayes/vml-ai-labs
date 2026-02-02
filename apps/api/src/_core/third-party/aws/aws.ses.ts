import { Stream } from 'stream';

import AWS from 'aws-sdk';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import nodemailer from 'nodemailer';

export interface Email {
	name?: string;
	address: string;
}

export interface AttachmentData {
	filename?: string;
	content?: string | Buffer | Stream;
	contentType?: string;
	encoding?: string;
	path?: string;
	raw?: string;
}

export class SES {
	private static sesConfig = {
		awsRegion: process.env.AWS_SES_REGION || process.env.AWS_REGION,
		accessKeyId:
			process.env.AWS_SES_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey:
			process.env.AWS_SES_SECRET_ACCESS_KEY ||
			process.env.AWS_SECRET_ACCESS_KEY,
	};

	// public static async send(
	// 	from: string,
	// 	subject: string,
	// 	text: string,
	// 	html: string,
	// 	to: string | Email[],
	// 	cc?: string | Email[],
	// 	bcc?: string | Email[]
	// ) {

	// 	if(process.env.RUNTIME_ENVIRONMENT !== 'aws') {
	// 		AWS.config.update({
	// 			accessKeyId: this.sesConfig.accessKeyId,
	// 			secretAccessKey: this.sesConfig.secretAccessKey
	// 		});
	// 	}

	// 	const ses = new AWSSES();

	// 	const response: AWS.SES.SendEmailResponse = await ses.sendEmail({
	// 		Source: from,
	// 		Destination: {
	// 			ToAddresses: to,
	// 			CcAddresses: cc,
	// 			BccAddresses: bcc
	// 		},
	// 		Message: {
	// 			Subject: subject,
	// 			Body: {
	// 				Text: text,
	// 				Html: html
	// 			}
	// 		}
	// 	})
	// 		.promise()
	// 		.catch(err => {
	// 			console.log(err);
	// 			return null;
	// 		});
	// }

	public static async sendRaw(
		to: string | Email[],
		from: string,
		subject: string,
		text: string,
		html: string,
		attachments?: AttachmentData[],
		_cc?: string | Email[],
		_bcc?: string | Email[],
		allBcc?: boolean,
	) {
		if (process.env.RUNTIME_ENVIRONMENT !== 'aws') {
			AWS.config.update({
				accessKeyId: this.sesConfig.accessKeyId,
				secretAccessKey: this.sesConfig.secretAccessKey,
			});
		}

		const sesClient = new SESv2Client({ region: this.sesConfig.awsRegion });

		const transport = nodemailer.createTransport({
			SES: { sesClient, SendEmailCommand },
		});

		const request: any = {
			to,
			from,
			subject,
			text,
			html,
		};

		if (allBcc) {
			request.bcc = to;
			delete request.to;
		}

		if (attachments) {
			request.attachments = attachments;
		}

		const result = await transport.sendMail(request).catch((err: Error) => {
			console.log(err);
			return null;
		});

		if (!result) {
			throw new Error("Coulnd't send email.");
		}

		return result;
	}
}
