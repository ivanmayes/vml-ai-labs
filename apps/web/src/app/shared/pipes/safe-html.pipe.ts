import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * Safe HTML Pipe
 * This pipe allows for safe HTML content to be inserted into the DOM
 */
@Pipe({
	standalone: false,
	name: 'safeHtml',
})
export class SafeHtmlPipe implements PipeTransform {
	constructor(private sanitizer: DomSanitizer) {}
	transform(html: string): unknown {
		return this.sanitizer.bypassSecurityTrustHtml(html);
	}
}
