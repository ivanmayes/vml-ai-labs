import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { UserRoleMap } from '../user/user.entity';
import { Organization } from './organization.entity';
import { Query } from './utils/query.utils';

export class Utils {
	public static Query = Query;
}
