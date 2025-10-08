import { IsNotEmpty, IsString } from 'class-validator';

export class SpaceCreateDto {
	@IsNotEmpty()
	@IsString()
	name: string;
}
