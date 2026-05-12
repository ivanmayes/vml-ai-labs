import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
	ImageResponse,
	ListImagesResponse,
	TagSuggestResponse,
} from '../models/image-library.types';

@Injectable({ providedIn: 'root' })
export class ImageLibraryWebService {
	constructor(private readonly http: HttpClient) {}

	private base(orgId: string, spaceId: string): string {
		return `${environment.apiUrl}/organization/${orgId}/space/${spaceId}/apps/image-library`;
	}

	listImages(
		orgId: string,
		spaceId: string,
		opts: {
			tags?: string[];
			page?: number;
			pageSize?: number;
			sort?: 'newest' | 'oldest';
		} = {},
	): Observable<{ data: ListImagesResponse }> {
		let params = new HttpParams();
		if (opts.tags && opts.tags.length > 0) {
			params = params.set('tags', opts.tags.join(','));
		}
		if (opts.page) params = params.set('page', String(opts.page));
		if (opts.pageSize)
			params = params.set('pageSize', String(opts.pageSize));
		if (opts.sort) params = params.set('sort', opts.sort);

		return this.http.get<{ data: ListImagesResponse }>(
			`${this.base(orgId, spaceId)}/images`,
			{ params },
		);
	}

	uploadImage(
		orgId: string,
		spaceId: string,
		file: File,
		tags: string[],
	): Observable<{ data: ImageResponse }> {
		const form = new FormData();
		form.append('file', file, file.name);
		form.append('tags', JSON.stringify(tags));
		return this.http.post<{ data: ImageResponse }>(
			`${this.base(orgId, spaceId)}/images`,
			form,
		);
	}

	deleteImage(
		orgId: string,
		spaceId: string,
		id: string,
	): Observable<unknown> {
		return this.http.delete(`${this.base(orgId, spaceId)}/images/${id}`);
	}

	suggestTags(
		orgId: string,
		spaceId: string,
		q: string,
		limit = 20,
	): Observable<{ data: TagSuggestResponse }> {
		const params = new HttpParams().set('q', q).set('limit', String(limit));
		return this.http.get<{ data: TagSuggestResponse }>(
			`${this.base(orgId, spaceId)}/tags`,
			{ params },
		);
	}
}
