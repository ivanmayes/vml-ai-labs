import readline from 'readline';
import 'colors';

export enum ErrorLevel {
	Info = 'info',
	Warning = 'warning',
	Error = 'error',
}

export class Utils {
	public static async getUserResponse(prompt: string): Promise<string> {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		return new Promise((resolve) =>
			rl.question(prompt, (ans) => {
				rl.close();
				resolve(ans);
			}),
		);
	}

	public static formatMessage(
		message: string,
		errorLevel: ErrorLevel = ErrorLevel.Info,
	) {
		let header = '::INFO::'.bgWhite.black.bold;
		switch (errorLevel) {
			case ErrorLevel.Warning:
				header = '::WARNING::'.bgYellow.black.bold;
				break;
			case ErrorLevel.Error:
				header = '::ERROR::'.bgRed.white.bold;
				break;
			default:
				break;
		}

		return header + '\t' + message;
	}
}
