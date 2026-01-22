import {
	DefaultHierarchyLevelType,
	FramedAppParentMethods,
	OsContext,
} from '@wppopen/core';
import { connectToParent } from 'penpal';
import { environment } from '../../../../environments/environment';
import { Injectable } from '@angular/core';

@Injectable({
	providedIn: 'root',
})
export class WppOpenService {
	private connection: Awaited<
		ReturnType<typeof connectToParent<FramedAppParentMethods>>
	> | null = null;
	private connecting = false;
	private connected = false;

	private readonly config = {
		parentOrigin: environment?.wppOpenParentOrigin?.length
			? environment.wppOpenParentOrigin
			: '*',
		debug: true,
	};

	private _context: OsContext;
	public get context(): OsContext {
		return this._context;
	}

	public connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			console.log(this.config);
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
						console.error('RECEIVED CONTEXT VVVVV');
						console.log(context);
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
				.catch((err) => {
					console.error(err);
					this.connecting = false;
					reject(new Error('Failed to connect to parent.'));
				});
		});
	}

	public async getAccessToken() {
		if (!this.connection) {
			await this.connect().catch((err) => {
				console.error(err);
				return null;
			});
		}

		if (!this.connection) {
			throw new Error('Connection not established.');
		}

		const accessToken = await this.connection.osApi
			.getAccessToken()
			.catch((err) => {
				console.error(err);
				return null;
			});

		if (!accessToken) {
			throw new Error('Failed to get access token.');
		}

		return accessToken;
	}

	public async getOsContext() {
		if (!this.connection) {
			await this.connect().catch((err) => {
				console.error(err);
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
			await this.connect().catch((err) => {
				console.error(err);
				return null;
			});
		}

		if (!this.connection) {
			throw new Error('Connection not established.');
		}

		const workspaceId = this.context?.workspace?.azId;
		if (!workspaceId) {
			throw new Error('Workspace ID not found.');
		}

		const scopeId = Object.values(this.context?.workspace?.mapping).find(
			(v) => !v.parentAzId,
		)?.azId;

		return {
			workspaceId,
			scopeId,
		};
	}

	public async getClient() {
		if (!this.connection) {
			await this.connect().catch((err) => {
				console.error(err);
				return null;
			});
		}

		if (!this.connection) {
			throw new Error('Connection not established.');
		}

		for (const v of Object.values(this.context?.workspace?.mapping)) {
			if (v.type === DefaultHierarchyLevelType.Client) {
				return v;
			}
		}

		throw new Error('Client not found.');
	}

	// private async receiveOsContext(context: FullscreenAppContext) {
	// 	this.connected = true;
	// 	console.error('RECEIVED CONTEXT VVVVV');
	// 	console.log(context);
	// 	this._context = context;
	// }
}
