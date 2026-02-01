import { Type } from 'class-transformer';
import {
	IsString,
	IsNotEmpty,
	IsEmail,
	ValidateNested,
	IsNumber,
	IsOptional,
} from 'class-validator';

export class OktaOauthClaims {
	@IsOptional()
	@IsNumber()
	ver?: number;

	@IsOptional()
	@IsString()
	jti?: string;

	@IsString()
	iss!: string;

	@IsOptional()
	@IsString()
	aud?: string;

	@IsOptional()
	@IsNumber()
	iat?: number;

	@IsOptional()
	@IsNumber()
	exp?: number;

	@IsNotEmpty()
	@IsString()
	cid!: string;

	@IsOptional()
	@IsString()
	uid?: string;

	@IsOptional()
	@IsString({ each: true })
	scp?: string[];

	@IsOptional()
	@IsString()
	sub?: string;
}
export class OktaOauthToken {
	@IsNotEmpty()
	@IsString()
	@IsOptional()
	value?: string;

	@IsNotEmpty()
	@IsString()
	accessToken!: string;

	@ValidateNested()
	@Type(() => OktaOauthClaims)
	claims!: OktaOauthClaims;

	@IsNotEmpty()
	@IsNumber()
	expiresAt!: number;

	@IsNotEmpty()
	@IsString()
	tokenType!: string;

	@IsNotEmpty()
	@IsString({ each: true })
	scopes!: string[];

	@IsNotEmpty()
	@IsString()
	authorizeUrl!: string;

	@IsNotEmpty()
	@IsString()
	userinfoUrl!: string;
}

export class OktaLoginRequestDto {
	@ValidateNested()
	@Type(() => OktaOauthToken)
	accessToken!: OktaOauthToken;

	@IsNotEmpty()
	idToken!: string[];

	@IsNotEmpty()
	@IsEmail()
	email!: string;

	@IsNotEmpty()
	@IsString()
	organizationId!: string;
}
