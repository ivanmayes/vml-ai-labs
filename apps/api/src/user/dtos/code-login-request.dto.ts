import { IsString, IsNotEmpty, IsEmail } from 'class-validator';

export class CodeLoginRequestDto {
	@IsNotEmpty()
	@IsString()
	singlePass: string;

	@IsNotEmpty()
	@IsEmail()
	email: string;

	@IsNotEmpty()
	@IsString()
	organizationId: string;
}
