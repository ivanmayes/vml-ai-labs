import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentSpace = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext) => {
		const request = ctx.switchToHttp().getRequest();
		return request.params?.spaceId || request.query?.spaceId;
	},
);
