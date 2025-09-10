import { Recipients } from "./notification.service";

export class Utils {
	public static applyMergeTags(input: string, mergeTags: Record<string, string>) {
		for(const tag in mergeTags) {
			const pattern = new RegExp(tag, 'g');
			input = input.replace(pattern, mergeTags[tag]);
		}
		return input;
	}

	public static recipientToStringArray(recipients: Recipients): { to?: string[], cc?: string[], bcc?: string[] } {
		const result: { to?: string[], cc?: string[], bcc?: string[] } = {};
		for(const k of Object.keys(recipients)) {
			if(recipients[k]) {
				if(Array.isArray(recipients[k])) {
					result[k] = recipients[k].map(v => v.email);
				} else {
					result[k] = [recipients[k]];
				}
			}
		}
		return result;
	}
}
