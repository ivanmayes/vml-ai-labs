import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { Locale } from '../_core/models/locale';

export class NotificationTemplate {
	public static slug: string;
	public static locale: Locale = Locale.enUS;
	public static subject: string;
	public static html: string;
	public static text: string;

	protected static load(filePath: string) {
		return fs.readFileSync(path.resolve(filePath), 'utf-8');
	}
}
