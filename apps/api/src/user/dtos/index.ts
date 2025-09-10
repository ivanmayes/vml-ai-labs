import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { PermissionType } from '../permission/models/permission.enum';
import { ApiProperty } from '@nestjs/swagger';

export { CodeRequestDto } from './code-request.dto';
export { CodeLoginRequestDto } from './code-login-request.dto';
export { LoginRequestDto } from './login-request.dto';
export { OktaLoginRequestDto } from './okta-login-request.dto';

export class PermissionDto {
	@IsEnum(PermissionType)
	@ApiProperty({ enum: PermissionType })
	type: PermissionType;
}