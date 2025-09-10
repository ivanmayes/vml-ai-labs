import { Console, Command } from 'nestjs-console';

@Console()
export class ExampleConsole {
	constructor() {}

	// npm run console:dev ExampleCommand
	@Command({
		command: 'ExampleCommand',
		description: 'Does nothing, then completes.'
	})
	public async exampleCommand() {
		await this.doSomething()
			.catch(err => {
				console.log(err);
				return null;
			});
		console.log('Done.');
	}

	private async doSomething() {
		return 'Okay';
	}
}
