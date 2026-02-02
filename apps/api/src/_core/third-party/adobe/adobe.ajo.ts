import https from 'https';

import axios, { AxiosRequestConfig } from 'axios';

export class AJOSSLConfig {
	privateKey!: string;
	certificate!: string;
	passphrase!: string;
}

export class AJOEnvironmentDefinition<T = string> {
	development!: T;
	production!: T;
}

export class AJOHeaderConfig {
	[key: string]: string;
}

export class AJOConfig {
	sslConfig?: AJOEnvironmentDefinition<AJOSSLConfig>;
	headers?: AJOEnvironmentDefinition<AJOHeaderConfig>;
	endpoint!: AJOEnvironmentDefinition<string>;
}

export class AJO {
	public static async sendTemplate(
		config: AJOConfig,
		toEmail: string,
		templateId: string,
		mergeTags: object = {},
		clientId: string = 'adobe',
	) {
		const reqConfig: AxiosRequestConfig = {
			headers: {},
			data: {
				eventId: templateId,
				clientId,
				email: toEmail,
				ctx: {},
			},
		};

		if (config.sslConfig) {
			const sslConfig = this.selectVariable<AJOSSLConfig>(
				config.sslConfig,
			);

			const httpsAgent = new https.Agent({
				rejectUnauthorized: true,
				cert: sslConfig.certificate
					.replace(/\\n/gm, '\n')
					.replace(/"/gm, ''),
				key: sslConfig.privateKey
					.replace(/\\n/gm, '\n')
					.replace(/"/gm, ''),
				passphrase: sslConfig.passphrase,
			});
			reqConfig.httpsAgent = httpsAgent;
		}

		if (config.headers) {
			const headers = this.selectVariable<AJOHeaderConfig>(
				config.headers,
			);
			for (const [k, v] of Object.entries(headers)) {
				reqConfig.headers![k] = v;
			}
		}

		reqConfig.data.ctx = {
			...reqConfig.data.ctx,
			...mergeTags,
		};

		// console.log(config);
		// console.log(reqConfig);

		return axios.post(
			this.selectVariable(config.endpoint),
			reqConfig.data,
			{
				httpsAgent: reqConfig.httpsAgent,
				headers: reqConfig.headers,
			},
		);
	}

	private static selectVariable<T = string>(
		input: AJOEnvironmentDefinition<T>,
	): T {
		if (process.env.ENVIRONMENT === 'production') {
			return input.production;
		} else {
			return input.development;
		}
	}
}
