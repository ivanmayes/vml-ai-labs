import { NotificationTemplate } from '../../notification-template';

export class Template extends NotificationTemplate {
	public static override slug: string = `login-code`;
	public static override subject: string = `Your Single-Use Login Code`;
	public static override html: string = Template.load(
		__dirname + '/template.html.hbs',
	);
	public static override text: string = Template.load(
		__dirname + '/template.txt.hbs',
	);
}
