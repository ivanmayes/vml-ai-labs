/**
 * Event Hint Interfaces
 *
 * Pure TypeScript interfaces for the event hints feature.
 * This file contains ONLY type definitions with no runtime dependencies,
 * so it can be safely imported by both the API and the Angular web app.
 */

/**
 * A single interaction hint to execute on a page.
 */
export interface EventHint {
	/** Action to perform */
	action: 'click' | 'hover' | 'fill' | 'fillSubmit' | 'wait' | 'remove';
	/** CSS selector targeting the element (not required for 'wait') */
	selector?: string;
	/** For 'click': number of times to click (default: 1) */
	count?: number;
	/** For 'fill': text value to enter */
	value?: string;
	/** For 'wait': duration in ms. For others: pause after action (ms) */
	waitAfter?: number;
	/** Execution order (lower runs first). Unsequenced hints run last. */
	seq?: number;
	/** Screenshot behavior: before action, after action, both, or never */
	snapshot?: 'before' | 'after' | 'both' | 'never';
	/** Device filter: only execute at matching viewport widths */
	device?: 'smartphone' | 'tablet' | 'desktop' | 'all';
	/** If true, executes once on the first page only (login/modal dismiss) */
	siteEntry?: boolean;
	/** Human-readable label for this hint's screenshots */
	label?: string;
}

/**
 * A group of hints applied to pages matching a URL glob pattern.
 */
export interface UrlHintGroup {
	/** Glob pattern matched against page URL pathname (e.g., "/products/*") */
	pattern: string;
	/** Hints for pages matching this pattern */
	hints: EventHint[];
}

/**
 * Top-level hint configuration on a ScrapeJob.
 */
export interface HintConfig {
	/** Hints applied to every page in the crawl */
	global: EventHint[];
	/** Hints applied only to pages matching the URL pattern */
	perUrl: UrlHintGroup[];
}

/**
 * Device breakpoints for hint device targeting.
 * smartphone: viewport < 768px
 * tablet: 768px <= viewport < 1024px
 * desktop: viewport >= 1024px
 */
export const DEVICE_BREAKPOINTS = {
	smartphone: 768,
	tablet: 1024,
} as const;
