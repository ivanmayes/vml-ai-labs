import { Injectable} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse } from 'axios';

@Injectable()
export class AppService {
	private readonly isDebug = process.env.DEBUG || false;

	constructor(
		private readonly http: HttpService
	) {}

	public getHello(): string {
		return 'Hello There!';
	}
}
