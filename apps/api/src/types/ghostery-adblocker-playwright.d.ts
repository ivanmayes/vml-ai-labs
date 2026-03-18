declare module '@ghostery/adblocker-playwright' {
	export class PlaywrightBlocker {
		static fromPrebuiltFull(): Promise<PlaywrightBlocker>;
		enableBlockingInPage(page: unknown): Promise<void>;
	}
}
