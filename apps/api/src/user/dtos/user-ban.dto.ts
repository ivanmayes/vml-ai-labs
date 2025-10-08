import { IsBoolean, IsNotEmpty, IsUUID } from 'class-validator';

export class UserBanDto {
	@IsNotEmpty()
	@IsUUID()
	userId: string;

	@IsNotEmpty()
	@IsBoolean()
	banned: boolean;
}
