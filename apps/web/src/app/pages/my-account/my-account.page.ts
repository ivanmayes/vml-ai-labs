import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	OnInit,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';

import { WppOpenService } from '../../_core/services/wpp-open/wpp-open.service';
import { PrimeNgModule } from '../../shared/primeng.module';

interface WppContextSnapshot {
	token: string | null;
	hierarchyId: string | null;
	tenantId: string | null;
	projectId: string | null;
	raw: unknown;
}

@Component({
	selector: 'app-my-account',
	templateUrl: './my-account.page.html',
	styleUrls: ['./my-account.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
	providers: [MessageService],
})
export class MyAccountPage implements OnInit {
	loading = signal(true);
	inWppOpen = signal(false);
	errorMessage = signal<string | null>(null);
	showRaw = signal(false);
	snapshot = signal<WppContextSnapshot | null>(null);

	constructor(
		private readonly wppOpenService: WppOpenService,
		private readonly messageService: MessageService,
		private readonly cdr: ChangeDetectorRef,
	) {}

	ngOnInit(): void {
		void this.detectWppOpen();
	}

	private async detectWppOpen(): Promise<void> {
		try {
			// `connect()` resolves once the parent frame posts the osContext.
			// Race it with a short timeout so we don't hang when the page is
			// opened outside the WPP Open iframe (no parent to respond).
			await Promise.race([
				this.wppOpenService.connect(),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error('WPP Open handshake timed out')),
						2000,
					),
				),
			]);

			const token = await this.wppOpenService
				.getAccessToken()
				.catch(() => null);
			const context = this.wppOpenService.context as unknown as
				| Record<string, unknown>
				| undefined;

			if (!context) {
				this.inWppOpen.set(false);
				return;
			}

			const hierarchy = (context['hierarchy'] ?? null) as {
				azId?: string;
				id?: string;
			} | null;
			const tenant = (context['tenant'] ?? null) as {
				id?: string;
				azId?: string;
			} | null;
			const project = (context['project'] ?? null) as {
				id?: string;
			} | null;

			this.snapshot.set({
				token: token ?? null,
				hierarchyId: hierarchy?.azId ?? hierarchy?.id ?? null,
				tenantId: tenant?.id ?? tenant?.azId ?? null,
				projectId: project?.id ?? null,
				raw: context,
			});
			this.inWppOpen.set(true);
		} catch (err) {
			this.inWppOpen.set(false);
			this.errorMessage.set(
				err instanceof Error
					? err.message
					: 'Unable to read WPP Open context',
			);
		} finally {
			this.loading.set(false);
			this.cdr.markForCheck();
		}
	}

	async copy(value: string | null | undefined, label: string): Promise<void> {
		if (!value) {
			this.messageService.add({
				severity: 'warn',
				summary: 'Nothing to copy',
				detail: `${label} is empty`,
				life: 2500,
			});
			return;
		}
		try {
			await navigator.clipboard.writeText(value);
			this.messageService.add({
				severity: 'success',
				summary: 'Copied',
				detail: `${label} copied to clipboard`,
				life: 2000,
			});
		} catch {
			this.messageService.add({
				severity: 'error',
				summary: 'Copy failed',
				detail: 'Clipboard access was denied',
				life: 3000,
			});
		}
	}

	copyRaw(): void {
		const raw = this.snapshot()?.raw;
		if (raw === undefined || raw === null) return;
		void this.copy(JSON.stringify(raw, null, 2), 'Full osContext');
	}

	toggleRaw(): void {
		this.showRaw.update((v) => !v);
	}

	rawJson(): string {
		const raw = this.snapshot()?.raw;
		if (raw === undefined || raw === null) return '';
		try {
			return JSON.stringify(raw, null, 2);
		} catch {
			return String(raw);
		}
	}
}
