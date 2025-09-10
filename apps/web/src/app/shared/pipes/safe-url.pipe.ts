import { Pipe, PipeTransform, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * Safe URL Pipe
 * This pipe will sanitize any url that is going to load content in the DOM
 * Commonly used for iframe content.
 */
@Pipe({
	name: 'safeUrl'
})
export class SafeUrlPipe implements PipeTransform {
	constructor(private sanitizer: DomSanitizer) {}
	transform(url) {
		// commented return throws error, both with URL and with RESOURCE_URL. idk why
		// return this.sanitizer.sanitize(SecurityContext.URL, url);
		return this.sanitizer.bypassSecurityTrustResourceUrl(this.sanitizer.sanitize(SecurityContext.URL, url));
	}
}
