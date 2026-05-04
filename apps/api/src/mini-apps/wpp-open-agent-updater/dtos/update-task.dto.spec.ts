import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateTaskDto } from './update-task.dto';

async function violations(payload: Record<string, unknown>): Promise<string[]> {
	const dto = plainToInstance(UpdateTaskDto, payload);
	const errors = await validate(dto);
	return errors.flatMap((e) => Object.keys(e.constraints ?? {}));
}

describe('UpdateTaskDto', () => {
	it('accepts a minimal valid payload', async () => {
		const errs = await violations({ name: 'Renamed' });
		expect(errs).toEqual([]);
	});

	it('accepts a re-point with project + agent + name', async () => {
		const errs = await violations({
			wppOpenProjectId: '4zBQjXPNiqDP8UDGSc1Zg',
			wppOpenAgentId: 'wfyYTuvCiIqAWS5LTFhgp',
			wppOpenAgentName: 'My Agent',
		});
		expect(errs).toEqual([]);
	});

	it('rejects wppOpenProjectId longer than 100 chars', async () => {
		const errs = await violations({
			wppOpenProjectId: 'a'.repeat(101),
		});
		expect(errs).toContain('maxLength');
	});

	it('rejects wppOpenProjectId with special characters', async () => {
		const errs = await violations({
			wppOpenProjectId: 'has/slashes',
		});
		expect(errs).toContain('matches');
	});

	it('rejects wppOpenAgentId longer than 100 chars', async () => {
		const errs = await violations({
			wppOpenAgentId: 'b'.repeat(101),
		});
		expect(errs).toContain('maxLength');
	});

	it('rejects wppOpenAgentName longer than 255 chars', async () => {
		const errs = await violations({
			wppOpenAgentName: 'c'.repeat(256),
		});
		expect(errs).toContain('maxLength');
	});

	it('rejects fileExtensions outside the supported set', async () => {
		const errs = await violations({
			fileExtensions: ['exe'],
		});
		expect(errs).toContain('isIn');
	});

	it('rejects an empty fileExtensions array (ArrayMinSize 1)', async () => {
		const errs = await violations({
			fileExtensions: [],
		});
		expect(errs).toContain('arrayMinSize');
	});

	it('rejects an unsupported cadence value', async () => {
		const errs = await violations({
			cadence: 'hourly',
		});
		expect(errs).toContain('isIn');
	});
});
