import { Pipe, PipeTransform } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { SessionQuery } from '../../state/session/session.query';

/**
 * Secure Request Pipe
 * Takes a SIMPL API endpoint and attaches a secure token to the request
 * Used mostly to pull in images from the SIMPL API
 */
@Pipe({
	name: 'secure',
})
export class SecureRequestPipe implements PipeTransform {
	constructor(
		private http: HttpClient,
		private sanitizer: DomSanitizer,
		private sessionQuery: SessionQuery,
	) {}

	transform(path: string, resource = false): Observable<SafeUrl> {
		return this.http
			.get(`${environment.apiUrl}${path}`, {
				responseType: 'blob',
				headers: {
					Authorization: `Bearer ${this.sessionQuery.getToken()}`,
				},
			})
			.pipe(
				map((val) => {
					if (!resource) {
						return this.sanitizer.bypassSecurityTrustUrl(
							URL.createObjectURL(val),
						);
					} else {
						return this.sanitizer.bypassSecurityTrustResourceUrl(
							URL.createObjectURL(val),
						);
					}
				}),
			);
	}
}
