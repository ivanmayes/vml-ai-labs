import { NotificationTemplate } from '../../notification-template';

export class Template extends NotificationTemplate {
	public static slug: string = `welcome`;
	public static subject: string = `Welcome to the Catalyst Promotions Program`;
	public static html: string = Template.load(__dirname + '/template.html.hbs');
	public static text: string = Template.load(__dirname + '/template.txt.hbs');
}