export function debugLoggingOnly() {
	const nativeLog = console.log;

	global.console.log = function(message?: any, ...optionalParams: any[]) {
		if(!process.env.DEBUG) {
			return;
		}
		nativeLog(message, ...optionalParams);
	}
}