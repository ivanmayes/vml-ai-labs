import { IsString, IsNotEmpty } from 'class-validator';

export class LoginRequestDto {
	@IsString()
	@IsNotEmpty()
	siteId: string;

	@IsString()
	@IsNotEmpty()
	email: string;
}
