import { IsNotEmpty, IsUUID, IsString } from 'class-validator';

export class SAML2_0LoginRequestDto {
	@IsNotEmpty()
	@IsUUID()
	organizationId: string;

	@IsNotEmpty()
	@IsString()
	authChallenge: string;
}

export class SAML2_0Response {
	@IsNotEmpty()
	@IsString()
	RelayState: string;

	@IsNotEmpty()
	@IsString()
	SAMLResponse: string;

	[key: string]: string;
}
