import axios from 'axios';

import { CollectionResponse } from './models';

export { Utils } from './utils';

export class Strapi {
	public static async queryCollection(
		collection: string,
		page: number = 1,
		pageSize: number = 10,
	): Promise<CollectionResponse<any>> {
		if (!this.isConfigured()) {
			throw new Error('Strapi not configured');
		}

		const params = new URLSearchParams();
		params.append('pagination[page]', page.toString());
		params.append('pagination[pageSize]', pageSize.toString());

		const response = await axios
			.get(`${process.env.STRAPI_HOST}/api/${collection}`, {
				params,
				headers: {
					Authorization: `Bearer ${process.env.STRAPI_TOKEN}`,
				},
			})
			.then((res) => res.data)
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!response) {
			throw new Error('Failed to query collection');
		}

		return response;
	}

	private static isConfigured(): boolean {
		return !!(process.env.STRAPI_HOST && process.env.STRAPI_TOKEN);
	}
}
