export enum OrganizationSelect {
	AuthenticationStrategies = 'authenticationStrategies'
}

export interface QueryOptions {
	//includeHiddenFundingSources?: boolean;
}

export class Query {
	public static readonly ORGANIZATION_QUERY_ALIAS: string = 'o';

	public static getSelects(
		alias: string = this.ORGANIZATION_QUERY_ALIAS,
		targets: OrganizationSelect[] = Object.values(OrganizationSelect)
	) {
		const selects: string[] = [];

		selects.push(`${alias}.id`);
		selects.push(`${alias}.name`);
		selects.push(`${alias}.slug`);
		selects.push(`${alias}.enabled`);
		selects.push(`${alias}.settings`);

		if (targets.includes(OrganizationSelect.AuthenticationStrategies)) {
			selects.push(
				`${alias}_authenticationstrategies."authenticationStrategyArr" AS "authenticationStrategies"`
			);
		}

		return selects.join(',');
	}

	public static getSubqueries(
		alias: string = this.ORGANIZATION_QUERY_ALIAS,
		targets: OrganizationSelect[] = Object.values(OrganizationSelect),
		options?: QueryOptions
	) {
		const subQueries: string[] = [];

		if (targets.includes(OrganizationSelect.AuthenticationStrategies)) {
			subQueries.push(`
				LATERAL (
					SELECT ARRAY (
						SELECT
							JSON_BUILD_OBJECT (
								'id', as2.id,
								'name', as2.name,
								'type', as2.type,
								'config', as2.config,
								'organizationId', as2."organizationId"
							)
						FROM
							"authenticationStrategies" AS as2
						WHERE
							as2."organizationId" = ${alias}.id
					) AS "authenticationStrategyArr"
				) AS ${alias}_authenticationstrategies
			`);
		}

		return subQueries.join(',');
	}
}
