import axios from 'axios';
import { WorkspaceHierarchy, WPPOpenTokenResponse, WPPOpenWorkspaceAncestorResponse } from './models';

export class WPPOpen {
	private static readonly config = {
		host: process.env.WPP_OPEN_HOST ?? 'https://apps-facade-api-prd-one.os.wpp.com/api/',
	};

	public static async validateToken(token: string): Promise<WPPOpenTokenResponse> {
		if(!WPPOpen.config?.host) {
			throw new Error('WPPOpen host is not set.');
		}

		const result = await axios
			.get(
				`${WPPOpen.config.host.replace(/\/$/, '')}/users/me`,
				{
					headers: {
						'Authorization': `Bearer ${token}`
					}
				}
			)
			.then(res => res.data)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!result) {
			throw new Error('WPPOpen token validation failed.');
		}

		console.log(result);

		return result;
	}

	public static async getScopeFromWorkspaceId(token: string, workspaceId: string, level: number = 1): Promise<WorkspaceHierarchy> {
		if(!WPPOpen.config?.host) {
			throw new Error('WPPOpen host is not set.');
		}

		const result: WPPOpenWorkspaceAncestorResponse = await axios
			.get(
				`${WPPOpen.config.host.replace(/\/$/, '')}/workspaces/${workspaceId}/ancestors`,
				{
					headers: {
						'Authorization': `Bearer ${token}`
					}
				}
			)
			.then(res => res.data)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!result?.data?.length) {
			throw new Error('WPPOpen workspace ancestors not found.');
		}

		return this.getAncestor(result.data, level, 0);
	}

	private static getAncestor(hierarchy: WorkspaceHierarchy[], targetLevel: number = 1, level: number = 0): WorkspaceHierarchy {
		if(level === targetLevel) {
			return hierarchy[0];
		}
		return this.getAncestor(hierarchy[0].ancestors, level + 1, targetLevel);
	}
}