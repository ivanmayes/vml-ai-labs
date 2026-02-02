/**
 * Convert a string into a slugified string
 * @param str
 */
export function stringToSlug(str: string) {
	str = str.replace(/^\s+|\s+$/g, ''); // trim
	str = str.toLowerCase();

	// remove accents, swap ñ for n, etc
	const from = 'àáäâèéëêìíïîòóöôùúüûñç·/_,:;';
	const to = 'aaaaeeeeiiiioooouuuunc------';
	for (let i = 0, l = from.length; i < l; i++) {
		str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
	}

	str = str
		.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
		.replace(/\s+/g, '-') // collapse whitespace and replace by -
		.replace(/-+/g, '-'); // collapse dashes

	return str;
}

/**
 * Retrieves the query string from the page url
 * @param name
 */
export function getQueryParamFromMalformedURL(name: string): string | number {
	const results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(
		decodeURIComponent(window.location.href),
	);
	if (!results) {
		return 0;
	}
	return results[1] || 0;
}

/**
 * Capitalize the first letter of a string
 * @param str
 */
export function capitalize(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export const camelCaseToSentences = (string: string) => {
	const result = string.replace(/([A-Z])/g, ' $1');
	const sentences = result.charAt(0).toUpperCase() + result.slice(1);
	return sentences;
};
