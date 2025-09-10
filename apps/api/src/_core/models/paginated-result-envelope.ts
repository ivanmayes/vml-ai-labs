export class PaginatedResultEnvelope {
	public page: number;
	public perPage: number;
	public numPages: number;
	public totalResults: number;
	public endpoint: string;
	public results: any[];
}
