import { NotificationTemplate } from '../../notification-template';

export class Template extends NotificationTemplate {
	public static slug: string = `login-code`;
	public static subject: string = `Your Single-Use Login Code`;
	public static html: string = Template.load(__dirname + '/template.html.hbs');
	public static text: string = Template.load(__dirname + '/template.txt.hbs');
}
