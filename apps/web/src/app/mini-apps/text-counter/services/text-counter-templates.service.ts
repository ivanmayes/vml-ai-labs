/**
 * Text-counter Template CRUD service.
 *
 * Wraps the org-scoped `/apps/text-counter/templates` endpoints exposed
 * by `TemplateController`. Every method unwraps the ResponseEnvelope so
 * callers get the typed payload directly — error envelopes surface as
 * the standard Angular HttpErrorResponse via RxJS.
 *
 * Auth headers are attached by the global HTTP interceptor; this
 * service is just HTTP-shape glue.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type {
	CreateTemplatePayload,
	Template,
	UpdateTemplatePayload,
} from '../models/template.types';

interface ResponseEnvelope<T> {
	status: 'success' | 'error';
	data: T;
	message?: string;
}

@Injectable({ providedIn: 'root' })
export class TextCounterTemplatesService {
	constructor(private readonly http: HttpClient) {}

	private base(orgId: string): string {
		return `${environment.apiUrl}/organization/${orgId}/apps/text-counter/templates`;
	}

	list(orgId: string): Observable<Template[]> {
		return this.http
			.get<ResponseEnvelope<Template[]>>(this.base(orgId))
			.pipe(map((env) => env.data));
	}

	get(orgId: string, id: string): Observable<Template> {
		return this.http
			.get<ResponseEnvelope<Template>>(`${this.base(orgId)}/${id}`)
			.pipe(map((env) => env.data));
	}

	create(
		orgId: string,
		payload: CreateTemplatePayload,
	): Observable<Template> {
		return this.http
			.post<ResponseEnvelope<Template>>(this.base(orgId), payload)
			.pipe(map((env) => env.data));
	}

	update(
		orgId: string,
		id: string,
		payload: UpdateTemplatePayload,
	): Observable<Template> {
		return this.http
			.put<
				ResponseEnvelope<Template>
			>(`${this.base(orgId)}/${id}`, payload)
			.pipe(map((env) => env.data));
	}

	delete(orgId: string, id: string): Observable<void> {
		return this.http
			.delete<ResponseEnvelope<void>>(`${this.base(orgId)}/${id}`)
			.pipe(map(() => undefined));
	}
}
