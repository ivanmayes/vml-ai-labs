import { IsNotEmpty, IsString } from 'class-validator';

export class TriggerRunDto {
	@IsNotEmpty()
	@IsString()
	wppOpenToken: string;
}
