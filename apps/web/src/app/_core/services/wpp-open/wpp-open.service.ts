import {
	DefaultHierarchyLevelType,
	FramedAppParentMethods,
	OsContext,
} from '@wppopen/core';
import { connectToParent, AsyncMethodReturns } from 'penpal';
import { Injectable } from '@angular/core';

import { environment } from '../../../../environments/environment';

@Injectable({
	providedIn: 'root',
})
export class WppOpenService {
	private connection: AsyncMethodReturns<FramedAppParentMethods> | null =
		null;
	private connecting = false;
	private connected = false;

	private readonly config = {
		parentOrigin: environment?.wppOpenParentOrigin?.length
			? environment.wppOpenParentOrigin
			: '*',
		debug: true,
	};

	private _context!: OsContext;
	public get context(): OsContext {
		return this._context;
	}

	public connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.connected || this.connecting) {
				resolve();
				return;
			}
			this.connection = null;
			this.connected = false;
			this.connecting = true;

			const connectionPromise = connectToParent<FramedAppParentMethods>({
				parentOrigin: this.config.parentOrigin,
				methods: {
					receiveOsContext: (context: OsContext) => {
						this.connecting = false;
						this.connected = true;
						this._context = context;
						resolve();
					},
				},
				debug: this.config.debug,
			});

			connectionPromise.promise
				.then((conn) => {
					this.connection = conn;
				})
				.catch(() => {
					this.connecting = false;
					reject(new Error('Failed to connect to parent.'));
				});
		});
	}

	public async getAccessToken() {
		if (!this.connection) {
			await this.connect().catch(() => {
				return null;
			});
		}

		if (!this.connection) {
			throw new Error('Connection not established.');
		}

		const accessToken = await this.connection.osApi
			.getAccessToken()
			.catch(() => {
				return null;
			});

		if (!accessToken) {
			throw new Error('Failed to get access token.');
		}

		return accessToken;
	}

	public async getOsContext() {
		if (!this.connection) {
			await this.connect().catch(() => {
				return null;
			});
		}

		if (!this.connection) {
			throw new Error('Connection not established.');
		}

		return this.context;
	}

	public async getWorkspaceScope() {
		if (!this.connection) {
			await this.connect().catch(() => {
				return null;
			});
		}

		if (!this.connection) {
			throw new Error('Connection not established.');
		}

		const hierarchy = this.context?.hierarchy;
		const tenantId = this.context?.tenant?.id;
		const tenantAzId = this.context?.tenant?.azId;

		// Check if tenant-level assignment (hierarchy matches tenant)
		if (hierarchy?.azId === tenantAzId) {
			console.log(
				'Tenant-level assignment detected, tenantId:',
				tenantId,
			);
			return {
				workspaceId: undefined,
				scopeId: undefined,
				tenantId,
			};
		}

		const workspaceId = hierarchy?.azId;
		const scopeId = Object.values(hierarchy?.mapping ?? {}).find(
			(v) => !v.parentAzId,
		)?.azId;

		return {
			workspaceId,
			scopeId,
			tenantId,
		};
	}

	public async getClient() {
		if (!this.connection) {
			await this.connect().catch(() => {
				return null;
			});
		}

		if (!this.connection) {
			throw new Error('Connection not established.');
		}

		const mapping = this.context?.hierarchy?.mapping ?? {};
		for (const v of Object.values(mapping)) {
			if (v.type === DefaultHierarchyLevelType.Client) {
				return v;
			}
		}

		console.log(
			'No client found in hierarchy (may be tenant-level assignment)',
		);
		return null;
	}

	// private async receiveOsContext(context: FullscreenAppContext) {
	// 	this.connected = true;
	// 	console.error('RECEIVED CONTEXT VVVVV');
	// 	console.log(context);
	// 	this._context = context;
	// }
}
