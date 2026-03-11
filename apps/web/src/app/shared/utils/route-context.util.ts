import { ActivatedRoute } from '@angular/router';

/**
 * Walk the route parent chain to find a `projectId` param.
 * Mini-apps call this to get optional project context.
 */
export function getProjectIdFromRoute(route: ActivatedRoute): string | null {
	let current: ActivatedRoute | null = route;
	while (current) {
		const projectId = current.snapshot.paramMap.get('projectId');
		if (projectId) return projectId;
		current = current.parent;
	}
	return null;
}
