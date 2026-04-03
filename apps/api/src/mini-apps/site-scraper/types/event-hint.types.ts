/**
 * Event Hint Types
 *
 * Shared TypeScript interfaces for the event hints feature.
 * Event hints allow users to configure Playwright interactions
 * (click, hover, fill, etc.) that execute before/between screenshots.
 */

import * as crypto from 'crypto';

import picomatch from 'picomatch';

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

// ---------------------------------------------------------------------------
// Hint resolution
// ---------------------------------------------------------------------------

/**
 * Deduplicate hints by `selector + action`, keeping the first occurrence.
 */
function deduplicateHints(hints: EventHint[]): EventHint[] {
	const seen = new Set<string>();
	const result: EventHint[] = [];
	for (const hint of hints) {
		const key = `${hint.selector ?? ''}::${hint.action}`;
		if (!seen.has(key)) {
			seen.add(key);
			result.push(hint);
		}
	}
	return result;
}

/**
 * Sort hints: hints with `seq` first (ascending), then hints without `seq`.
 */
function sortHints(hints: EventHint[]): EventHint[] {
	return [...hints].sort((a, b) => {
		const aHasSeq = a.seq != null;
		const bHasSeq = b.seq != null;
		if (aHasSeq && bHasSeq) return a.seq! - b.seq!;
		if (aHasSeq && !bHasSeq) return -1;
		if (!aHasSeq && bHasSeq) return 1;
		return 0;
	});
}

/**
 * Resolve which hints apply to a given page URL.
 *
 * - If no config or both global and perUrl are empty, returns [].
 * - Extracts pathname from `pageUrl` and checks each perUrl group's pattern.
 * - If ANY per-URL pattern matches: collects hints from ALL matching groups
 *   (merge), ignoring global hints entirely (full replacement override semantics).
 * - If NO per-URL pattern matches: returns global hints.
 * - Deduplicates by `selector + action` (keeps first occurrence).
 * - Sorts: hints with `seq` first (ascending), then hints without `seq`.
 */
export function resolveHintsForUrl(config: HintConfig, pageUrl: string): EventHint[] {
	if (!config) return [];

	const hasGlobal = config.global && config.global.length > 0;
	const hasPerUrl = config.perUrl && config.perUrl.length > 0;

	if (!hasGlobal && !hasPerUrl) return [];

	const pathname = new URL(pageUrl).pathname;

	// Find all matching per-URL groups
	const matchedHints: EventHint[] = [];
	let anyPerUrlMatch = false;

	if (hasPerUrl) {
		for (const group of config.perUrl) {
			if (picomatch.isMatch(pathname, group.pattern)) {
				anyPerUrlMatch = true;
				matchedHints.push(...group.hints);
			}
		}
	}

	// If any per-URL pattern matched, use merged per-URL hints (full replacement)
	// Otherwise, fall back to global hints
	const rawHints = anyPerUrlMatch ? matchedHints : [...(config.global || [])];

	return sortHints(deduplicateHints(rawHints));
}

// ---------------------------------------------------------------------------
// Fill value encryption / decryption (AES-256-GCM)
// ---------------------------------------------------------------------------

const CIPHER_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Derive a 32-byte key from an arbitrary key string using SHA-256.
 */
function deriveKey(key: string): Buffer {
	return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a fill value using AES-256-GCM.
 *
 * @param value - The plaintext value to encrypt.
 * @param key   - The key string (will be SHA-256 hashed to 32 bytes).
 * @returns Format: `${iv hex}:${authTag hex}:${ciphertext hex}`
 */
export function encryptFillValue(value: string, key: string): string {
	const derivedKey = deriveKey(key);
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, derivedKey, iv);

	const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a fill value encrypted with `encryptFillValue`.
 *
 * @param encrypted - The encrypted string in format `${iv hex}:${authTag hex}:${ciphertext hex}`.
 * @param key       - The same key string used for encryption.
 * @returns The decrypted plaintext value.
 */
export function decryptFillValue(encrypted: string, key: string): string {
	const parts = encrypted.split(':');
	if (parts.length !== 3) {
		throw new Error('Invalid encrypted fill value format: expected iv:authTag:ciphertext');
	}

	const [ivHex, authTagHex, ciphertextHex] = parts;
	const derivedKey = deriveKey(key);
	const iv = Buffer.from(ivHex, 'hex');
	const authTag = Buffer.from(authTagHex, 'hex');
	const ciphertext = Buffer.from(ciphertextHex, 'hex');

	const decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, derivedKey, iv);
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return decrypted.toString('utf8');
}

// ---------------------------------------------------------------------------
// Bulk encryption / decryption helpers
// ---------------------------------------------------------------------------

/** Actions whose `value` field contains sensitive data requiring encryption. */
const ENCRYPTABLE_ACTIONS: ReadonlySet<string> = new Set(['fill', 'fillSubmit']);

/**
 * Deep clone the HintConfig and encrypt all `value` fields in fill/fillSubmit hints.
 * Used before persisting to the database or sending via SQS.
 */
export function encryptHintValues(config: HintConfig, key: string): HintConfig {
	const cloned: HintConfig = JSON.parse(JSON.stringify(config));

	const encryptHint = (hint: EventHint): void => {
		if (ENCRYPTABLE_ACTIONS.has(hint.action) && hint.value != null) {
			hint.value = encryptFillValue(hint.value, key);
		}
	};

	if (cloned.global) {
		for (const hint of cloned.global) {
			encryptHint(hint);
		}
	}

	if (cloned.perUrl) {
		for (const group of cloned.perUrl) {
			for (const hint of group.hints) {
				encryptHint(hint);
			}
		}
	}

	return cloned;
}

/**
 * Decrypt all `value` fields in fill/fillSubmit hints.
 * Used by the Lambda at execution time after resolving hints for a page.
 */
export function decryptHintValues(hints: EventHint[], key: string): EventHint[] {
	return hints.map((hint) => {
		if (ENCRYPTABLE_ACTIONS.has(hint.action) && hint.value != null) {
			return { ...hint, value: decryptFillValue(hint.value, key) };
		}
		return { ...hint };
	});
}
