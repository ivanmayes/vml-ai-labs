import { RunWorkerService } from './run-worker.service';
import { WppOpenPermissionError } from './wpp-open-agent.service';

describe('RunWorkerService.toRunErrorMessage', () => {
	it('returns the human message for WppOpenPermissionError', () => {
		const err = new WppOpenPermissionError('4zBQjXPNiqDP8UDGSc1Zg');
		const msg = RunWorkerService.toRunErrorMessage(err);
		expect(msg).toContain('not accessible from your current workspace');
	});

	it('returns the .message for any other Error', () => {
		const err = new Error('something else broke');
		expect(RunWorkerService.toRunErrorMessage(err)).toBe(
			'something else broke',
		);
	});

	it('falls back for non-Error throwables', () => {
		expect(RunWorkerService.toRunErrorMessage('weird')).toBe(
			'Unknown error',
		);
		expect(RunWorkerService.toRunErrorMessage(undefined)).toBe(
			'Unknown error',
		);
	});
});
