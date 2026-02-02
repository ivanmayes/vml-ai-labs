import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class AppService {
	// @ts-expect-error reserved for future use
	private readonly _isDebug = process.env.DEBUG || false;

	// @ts-expect-error HttpService injected but not yet used
	constructor(private readonly _http: HttpService) {}

	public getHello(): string {
		return 'Hello There!';
	}
}
