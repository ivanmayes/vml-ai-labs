import { IsOptional, IsString, IsObject } from 'class-validator';

export enum ResponseStatus {
	Success = 'success',
	Failure = 'failure',
	Error = 'error'
}

export class RequestMeta {
	@IsOptional()
	@IsString()
	public jobNumber?: string;
	
	@IsOptional()
	@IsString()
	public tenant?: string;
	
	@IsOptional()
	@IsString()
	public client?: string;

	@IsOptional()
	@IsString()
	public market?: string;
}

export class RequestEnvelope {
	@IsOptional()
	@IsObject()
	public meta?: RequestMeta;
}

export class ResponseEnvelope {
	public status: ResponseStatus;
	public message?: string;
	public data?: any;

	constructor(status: ResponseStatus, message?: string, data?: any) {
		this.status = status;
		this.message = message;
		this.data = data;
	}
}

export class FindResponse<T> {
	public page?: number;
	public perPage?: number;
	public numPages?: number;
	public totalResults?: number;
	public results?: T[];
	public endpoint?: string;
}

export class ResponseEnvelopeFind<T> extends ResponseEnvelope {
	public data: FindResponse<T>;
}

export enum SortStrategy {
	ASC = 'ASC',
	DESC = 'DESC'
}

export class FindOptions<T> {
	page: number;
	perPage: number;
	sortBy?: keyof T;
	sortOrder?: SortStrategy;
}