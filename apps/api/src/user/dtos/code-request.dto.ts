import { IsString, IsNotEmpty, IsEmail } from 'class-validator';

export class CodeRequestDto {
	@IsNotEmpty()
	@IsEmail()
	email: string;

	@IsString()
	@IsNotEmpty()
	organizationId: string;
}
