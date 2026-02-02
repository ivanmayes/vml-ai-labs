import { Console, Command } from 'nestjs-console';

@Console()
export class ExampleConsole {
	// eslint-disable-next-line @typescript-eslint/no-empty-function -- Required for NestJS console
	constructor() {}

	// npm run console:dev ExampleCommand
	@Command({
		command: 'ExampleCommand',
		description: 'Does nothing, then completes.',
	})
	public async exampleCommand() {
		await this.doSomething().catch(() => {
			return null;
		});
	}

	private async doSomething() {
		return 'Okay';
	}
}
