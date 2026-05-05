import {
	WppOpenAgentService,
	WppOpenPermissionError,
	WppOpenAgentMismatchError,
	CS_PERMISSION_ERROR_CODE,
	CS_AGENT_MISMATCH_ERROR_CODE,
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

describe('WppOpenAgentService.getAgentConfig (agent mismatch detection)', () => {
	let service: WppOpenAgentService;
	let originalFetch: typeof fetch;

	beforeEach(() => {
		service = new WppOpenAgentService();
		originalFetch = global.fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it('throws WppOpenAgentMismatchError when CS rejects with the mismatch code', async () => {
		const errorBody = JSON.stringify({
			message: 'Agent config does not belong to project',
			errors: [
				{
					code: CS_AGENT_MISMATCH_ERROR_CODE,
					title: 'Agent config does not belong to project',
					detail: 'Agent config does not belong to project',
					status: 400,
				},
			],
		});

		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 400,
			text: () => Promise.resolve(errorBody),
			json: () => Promise.resolve({}),
		} as unknown as Response);

		try {
			await service.getAgentConfig(
				'token',
				'4zBQjXPNiqDP8UDGSc1Zg',
				'wfyYTuvCiIqAWS5LTFhgp',
			);
			fail('expected throw');
		} catch (err) {
			expect(err).toBeInstanceOf(WppOpenAgentMismatchError);
			expect((err as WppOpenAgentMismatchError).projectId).toBe(
				'4zBQjXPNiqDP8UDGSc1Zg',
			);
			expect((err as WppOpenAgentMismatchError).agentId).toBe(
				'wfyYTuvCiIqAWS5LTFhgp',
			);
			expect((err as WppOpenAgentMismatchError).code).toBe(
				CS_AGENT_MISMATCH_ERROR_CODE,
			);
		}
	});

	it('does NOT treat a 400 without the mismatch code as a mismatch error', async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 400,
			text: () => Promise.resolve('{"message":"some other 400"}'),
			json: () => Promise.resolve({}),
		} as unknown as Response);

		await expect(
			service.getAgentConfig('token', 'project-id', 'agent-id'),
		).rejects.not.toBeInstanceOf(WppOpenAgentMismatchError);
	});
});

describe('WppOpenAgentService 5xx error message includes response body', () => {
	let service: WppOpenAgentService;
	let originalFetch: typeof fetch;

	beforeEach(() => {
		service = new WppOpenAgentService();
		originalFetch = global.fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it('surfaces a slice of the CS response body in the 500 error message', async () => {
		// Pre-fix: every 5xx surfaced the same opaque "WPP Open API
		// error: 500" — diagnosing meant tailing Heroku logs. Now the
		// run-detail page itself tells the user *why* CS rejected.
		const errorBody = JSON.stringify({
			message: 'Item size has exceeded the maximum allowed size',
			detail: 'agent config exceeds 400KB DynamoDB cap',
		});

		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 500,
			text: () => Promise.resolve(errorBody),
			json: () => Promise.resolve({}),
		} as unknown as Response);

		try {
			await service.listAgents('token', 'project-id');
			fail('expected throw');
		} catch (err) {
			expect((err as Error).message).toContain('500');
			expect((err as Error).message).toContain('Item size has exceeded');
		}
	});

	it('truncates very long error bodies to keep the message UI-friendly', async () => {
		const longBody = 'x'.repeat(2000);

		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 502,
			text: () => Promise.resolve(longBody),
			json: () => Promise.resolve({}),
		} as unknown as Response);

		try {
			await service.listAgents('token', 'project-id');
			fail('expected throw');
		} catch (err) {
			// Status + truncated body separator ' — ' adds a few chars on
			// top of the 300-char body slice; allow a small margin.
			expect((err as Error).message.length).toBeLessThan(400);
		}
	});
});
