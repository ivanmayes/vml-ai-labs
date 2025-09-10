import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SessionQuery } from '../../state/session/session.query';

@Injectable()
export class RequestInterceptor implements HttpInterceptor {
	// Unsecured routes that shouldn't be subject to adding auth tokens go here
	readonly UNSECURED_ROUTES = [
		'/auth/basic/generate-sign-in-code',
		'/auth/basic/code-sign-in'
	];

	constructor(private readonly sessionQuery: SessionQuery) {}

	/**
	 * Intercept all outgoing http requests and run various operations on them
	 * @param request
	 * @param next
	 */
	intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
		// Don't add an access token to unsecured routes
		if (this.isUnsecuredRoute(request.url)) {
			return next.handle(request);
		}

		// Anything that makes it to here gets a session token
		return next.handle(this.setAccessToken(request, this.sessionQuery.getToken()));
	}

	/**
	 * Clone a request with an Authorization token attached
	 * @param request
	 * @param accessToken
	 */
	private setAccessToken(request: HttpRequest<any>, accessToken: string | undefined) {
		// We clone the request, because the original request is immutable
		return request.clone({
			setHeaders: {
				Authorization: `Bearer ${accessToken}`
			}
		});
	}

	/**
	 * Check if the url contains a match to one of our unsecured routes
	 * @param requestUrl
	 */
	private isUnsecuredRoute(requestUrl: string): boolean {
		let match = false;
		this.UNSECURED_ROUTES.forEach(part => {
			if (requestUrl.indexOf(part) > -1) {
				match = true;
			}
		});
		return match;
	}
}
