import { OktaOauthToken } from '../dtos/okta-login-request.dto';

export interface JwtPayload {
	id: string;
	email: string;
	emailNormalized: string;
	role: string;
	oktaOauthToken?: OktaOauthToken;
}
