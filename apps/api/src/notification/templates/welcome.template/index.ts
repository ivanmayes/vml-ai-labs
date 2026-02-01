import { NotificationTemplate } from '../../notification-template';

export class Template extends NotificationTemplate {
	public static override slug: string = `welcome`;
	public static override subject: string = `Welcome to the Catalyst Promotions Program`;
	public static override html: string = Template.load(
		__dirname + '/template.html.hbs',
	);
	public static override text: string = Template.load(
		__dirname + '/template.txt.hbs',
	);
}
