import {
	WppOpenAgentService,
	WppOpenPermissionError,
	CS_PERMISSION_ERROR_CODE,
} from './wpp-open-agent.service';

describe('WppOpenAgentService.listAgents', () => {
	let service: WppOpenAgentService;
	let originalFetch: typeof fetch;

	beforeEach(() => {
		service = new WppOpenAgentService();
		originalFetch = global.fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it('throws WppOpenPermissionError when CS returns the missing-permissions code', async () => {
		const errorBody = JSON.stringify({
			message: 'forbidden',
			errors: [
				{
					code: CS_PERMISSION_ERROR_CODE,
					title: 'Missing permissions to external project',
					detail: 'The user does not have permission to access the external project',
				},
			],
		});

		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 403,
			text: () => Promise.resolve(errorBody),
			json: () => Promise.resolve({}),
		} as unknown as Response);

		await expect(
			service.listAgents('token', '4zBQjXPNiqDP8UDGSc1Zg'),
		).rejects.toBeInstanceOf(WppOpenPermissionError);

		// And the error carries the projectId pulled from the URL for the UI to use.
		try {
			await service.listAgents('token', '4zBQjXPNiqDP8UDGSc1Zg');
			fail('expected throw');
		} catch (err) {
			expect(err).toBeInstanceOf(WppOpenPermissionError);
			expect((err as WppOpenPermissionError).projectId).toBe(
				'4zBQjXPNiqDP8UDGSc1Zg',
			);
			expect((err as WppOpenPermissionError).code).toBe(
				CS_PERMISSION_ERROR_CODE,
			);
		}
	});

	it('throws a generic HttpException for other 4xx errors', async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 400,
			text: () => Promise.resolve('bad request'),
			json: () => Promise.resolve({}),
		} as unknown as Response);

		await expect(
			service.listAgents('token', 'project-id'),
		).rejects.not.toBeInstanceOf(WppOpenPermissionError);
	});

	it('does NOT treat a 403 without the access-layer code as a permission error', async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 403,
			text: () => Promise.resolve('{"message":"some other 403"}'),
			json: () => Promise.resolve({}),
		} as unknown as Response);

		await expect(
			service.listAgents('token', 'project-id'),
		).rejects.not.toBeInstanceOf(WppOpenPermissionError);
	});
});
