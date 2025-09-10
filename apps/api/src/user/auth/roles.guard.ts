import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		// Grab roles from the current route, if they are set
		const roles = this.reflector.get<string[]>('roles', context.getHandler());
		if(!roles) {
			return true;
		}
		const request = context.switchToHttp()
			.getRequest();
		const user = request.user;
		return user && user.role && roles.includes(user.role);
	}
}
