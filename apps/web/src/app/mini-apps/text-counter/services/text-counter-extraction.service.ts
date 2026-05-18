/**
 * Text-counter vision extraction service.
 *
 * Wraps `POST /apps/text-counter/extract` — a single multipart endpoint
 * that accepts an image file plus a mode (`general` | `template`) and
 * an optional `templateId`, and returns either a flat region list or
 * field-matched text plus an unassigned pool.
 *
 * Mirrors the multipart upload pattern used by image-library
 * (FormData + HttpClient.post). No image or text persists server-side
 * — the buffer is dropped after the vision call returns.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import type { ExtractMode, ExtractionResult } from '../models/extraction.types';

interface ResponseEnvelope<T> {
	status: 'success' | 'error';
	data: T;
	message?: string;
}

@Injectable({ providedIn: 'root' })
export class TextCounterExtractionService {
	constructor(private readonly http: HttpClient) {}

	private endpoint(orgId: string): string {
		return `${environment.apiUrl}/organization/${orgId}/apps/text-counter/extract`;
	}

	extract(
		orgId: string,
		file: File,
		mode: ExtractMode,
		templateId?: string,
	): Observable<ExtractionResult> {
		const form = new FormData();
		form.append('file', file, file.name);
		form.append('mode', mode);
		if (templateId !== undefined) {
			form.append('templateId', templateId);
		}

		return this.http
			.post<
				ResponseEnvelope<ExtractionResult>
			>(this.endpoint(orgId), form)
			.pipe(map((env) => env.data));
	}
}
