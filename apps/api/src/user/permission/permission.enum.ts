
export enum PermissionType {
	//PIIView = 'piiView',
	PIIExport = 'piiExport',
	CampaignSelectWinner = 'campaignSelectWinner',
	CampaignResetPrizeListings = 'campaignResetPrizeListings',
	//CampaignResetRewardListings = 'campaignResetRewardListings',
	EntrantViewIdentifiers = 'entrantViewIdentifiers',
	EntrantViewFulfillment = 'entrantViewFulfillment',
	EntrantContact = 'entrantContact',
	EntrantBanIP = 'entrantBanIP',
	EntrantBanID = 'entrantBanID',
	EntryConfirm = 'entryConfirm'
};

export const PermissionTypeLabels = {
	[PermissionType.PIIExport]: 'Export PII Information',
	[PermissionType.CampaignSelectWinner]: 'Select Campaign Winner',
	[PermissionType.CampaignResetPrizeListings]: 'Reset Campaign Prize Listings',
	[PermissionType.EntrantViewIdentifiers]: 'View Entrant Personal Identifiers',
	[PermissionType.EntrantViewFulfillment]: 'View Entrant Fulfillment Details',
	[PermissionType.EntrantContact]: 'Contact Entrant',
	[PermissionType.EntrantBanIP]: 'Ban Entrant IP Address',
	[PermissionType.EntrantBanID]: 'Ban Entrant ID',
	[PermissionType.EntryConfirm]: 'Confirm Entry'
};