export interface EmailTemplate {
	subject: string;
	text: string;
	html: string;
}

export interface EmailConfig {
	name: string;
	address: string;
}

export interface SecurityConfig {
	emailRequirement?: RegExp;
	singlePassExpire?: string;
	singlePassLength?: number;
}

export interface SystemConfig {
	email: EmailConfig;
	security: SecurityConfig;
}

export interface AppConfig {
	system: SystemConfig;
}

export const Config: AppConfig = {
	system : {
		email : {
			// Configure as-needed.
			name: 'YOUR APP NAME Support',
			address: 'info@geometrysites.com'
		},
		security: {
			// Configure as-needed.
			emailRequirement: new RegExp(/.*@(vml)\.com$/),
			singlePassLength: 6,
			singlePassExpire: '5m'
		}
	}
};