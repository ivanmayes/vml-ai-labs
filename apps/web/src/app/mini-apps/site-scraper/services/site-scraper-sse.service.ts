import { Injectable, inject, signal, NgZone, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

import { environment } from '../../../../environments/environment';

import { SiteScraperService } from './site-scraper.service';

export interface JobStartedEvent {
	id: string;
	status: 'running';
	url: string;
}

export interface PageCompletedEvent {
	id: string;
	pageUrl: string;
	title: string | null;
	pagesCompleted: number;
	pagesDiscovered: number;
}

export interface PagesDiscoveredEvent {
	id: string;
	newUrls: string[];
	totalDiscovered: number;
}

export interface JobCompletedEvent {
	id: string;
	status: 'completed' | 'completed_with_errors';
	pagesCompleted: number;
	pagesFailed: number;
	pagesDiscovered: number;
}

export interface JobFailedEvent {
	id: string;
	status: 'failed';
	error: {
		code: string;
		message: string;
		retryable: boolean;
		timestamp: string;
	};
}

export interface JobCancelledEvent {
	id: string;
	status: 'cancelled';
}

@Injectable()
export class SiteScraperSseService implements OnDestroy {
	private readonly zone = inject(NgZone);
	private readonly scraperService = inject(SiteScraperService);

	private eventSource: EventSource | null = null;
	private reconnectAttempts = 0;
	private readonly maxReconnectAttempts = 5;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	readonly connectionStatus = signal<
		'disconnected' | 'connecting' | 'connected'
	>('disconnected');

	private readonly _jobStarted = new Subject<JobStartedEvent>();
	private readonly _pageCompleted = new Subject<PageCompletedEvent>();
	private readonly _pagesDiscovered = new Subject<PagesDiscoveredEvent>();
	private readonly _jobCompleted = new Subject<JobCompletedEvent>();
	private readonly _jobFailed = new Subject<JobFailedEvent>();
	private readonly _jobCancelled = new Subject<JobCancelledEvent>();

	readonly jobStarted$ = this._jobStarted.asObservable();
	readonly pageCompleted$ = this._pageCompleted.asObservable();
	readonly pagesDiscovered$ = this._pagesDiscovered.asObservable();
	readonly jobCompleted$ = this._jobCompleted.asObservable();
	readonly jobFailed$ = this._jobFailed.asObservable();
	readonly jobCancelled$ = this._jobCancelled.asObservable();

	connect(): void {
		if (this.eventSource) {
			this.disconnect();
		}

		this.connectionStatus.set('connecting');

		this.scraperService.getSseToken().subscribe({
			next: (res) => {
				const token = res.data.token;
				this.createEventSource(token);
			},
			error: () => {
				this.connectionStatus.set('disconnected');
				this.scheduleReconnect();
			},
		});
	}

	private createEventSource(token: string): void {
		const baseUrl = `${environment.apiUrl}/organization/${environment.organizationId}/apps/site-scraper`;
		const url = `${baseUrl}/sse/stream?token=${encodeURIComponent(token)}`;

		this.zone.runOutsideAngular(() => {
			this.eventSource = new EventSource(url);

			this.eventSource.addEventListener('connection', () => {
				this.zone.run(() => {
					this.connectionStatus.set('connected');
					this.reconnectAttempts = 0;
				});
			});

			this.eventSource.addEventListener('heartbeat', () => {
				// Heartbeat received - connection is alive
			});

			this.eventSource.addEventListener(
				'job:started',
				(event: MessageEvent) => {
					this.zone.run(() => {
						this._jobStarted.next(JSON.parse(event.data));
					});
				},
			);

			this.eventSource.addEventListener(
				'page:completed',
				(event: MessageEvent) => {
					this.zone.run(() => {
						this._pageCompleted.next(JSON.parse(event.data));
					});
				},
			);

			this.eventSource.addEventListener(
				'pages:discovered',
				(event: MessageEvent) => {
					this.zone.run(() => {
						this._pagesDiscovered.next(JSON.parse(event.data));
					});
				},
			);

			this.eventSource.addEventListener(
				'job:completed',
				(event: MessageEvent) => {
					this.zone.run(() => {
						this._jobCompleted.next(JSON.parse(event.data));
					});
				},
			);

			this.eventSource.addEventListener(
				'job:failed',
				(event: MessageEvent) => {
					this.zone.run(() => {
						this._jobFailed.next(JSON.parse(event.data));
					});
				},
			);

			this.eventSource.addEventListener(
				'job:cancelled',
				(event: MessageEvent) => {
					this.zone.run(() => {
						this._jobCancelled.next(JSON.parse(event.data));
					});
				},
			);

			this.eventSource.onerror = () => {
				this.zone.run(() => {
					this.connectionStatus.set('disconnected');
					this.eventSource?.close();
					this.eventSource = null;
					this.scheduleReconnect();
				});
			};
		});
	}

	private scheduleReconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			return;
		}

		this.reconnectAttempts++;
		const delay = Math.min(
			3000 * Math.pow(2, this.reconnectAttempts - 1),
			30000,
		);

		this.reconnectTimer = setTimeout(() => {
			this.connect();
		}, delay);
	}

	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
		this.reconnectAttempts = 0;
		this.connectionStatus.set('disconnected');
	}

	ngOnDestroy(): void {
		this.disconnect();
		this._jobStarted.complete();
		this._pageCompleted.complete();
		this._pagesDiscovered.complete();
		this._jobCompleted.complete();
		this._jobFailed.complete();
		this._jobCancelled.complete();
	}
}
