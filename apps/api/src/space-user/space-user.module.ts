import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

import { User } from '../user/user.entity';
import { AuthenticationStrategy } from '../authentication-strategy/authentication-strategy.entity';

import { SpaceUser } from './space-user.entity';
import { SpaceUserService } from './space-user.service';
import { SpaceUserController } from './space-user.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([SpaceUser, User, AuthenticationStrategy]),
		PassportModule.register({ defaultStrategy: 'jwt' })
	],
	controllers: [SpaceUserController],
	providers: [SpaceUserService],
	exports: [SpaceUserService, TypeOrmModule]
})
export class SpaceUserModule {}
