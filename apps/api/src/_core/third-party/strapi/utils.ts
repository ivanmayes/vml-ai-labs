import { FindResponse } from '../../models';

import { CollectionResponse } from './models';

export class Utils {
	public static collectionResponseToFindResponse<T>(collectionResponse: CollectionResponse<T>): FindResponse<T> {
		return {
			page: collectionResponse.meta.pagination.page,
			perPage: collectionResponse.meta.pagination.pageSize,
			numPages: collectionResponse.meta.pagination.pageCount,
			totalResults: collectionResponse.meta.pagination.total,
			results: collectionResponse.data
		};
	}
}