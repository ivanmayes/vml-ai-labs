import { Recipients } from './notification.service';

export class Utils {
	public static applyMergeTags(
		input: string,
		mergeTags: Record<string, string>,
	) {
		for (const tag in mergeTags) {
			const pattern = new RegExp(tag, 'g');
			input = input.replace(pattern, mergeTags[tag]);
		}
		return input;
	}

	public static recipientToStringArray(recipients: Recipients): {
		to?: string[];
		cc?: string[];
		bcc?: string[];
	} {
		const result: { to?: string[]; cc?: string[]; bcc?: string[] } = {};
		const recipientsRecord = recipients as Record<string, unknown>;
		for (const k of Object.keys(recipients)) {
			if (recipientsRecord[k]) {
				if (Array.isArray(recipientsRecord[k])) {
					(result as Record<string, string[]>)[k] = (
						recipientsRecord[k] as { email: string }[]
					).map((v) => v.email);
				} else {
					(result as Record<string, string[]>)[k] = [
						recipientsRecord[k] as string,
					];
				}
			}
		}
		return result;
	}
}
