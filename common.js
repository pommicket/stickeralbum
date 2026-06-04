export const COUNTRY_IDS = `FWC MEX RSA KOR CZE CAN BIH QAT SUI BRA MAR HAI SCO USA PAR AUS TUR GER CUW CIV ECU NED JPN SWE TUN BEL EGY IRN NZL ESP CPV KSA URU FRA SEN IRQ NOR ARG ALG AUT JOR POR COD UZB COL ENG CRO GHA PAN`
	.split(' ');
export const STICKERS_PER_COUNTRY = 20;
const COUNTRY_ALPHABETICAL_ORDER = (() => {
	const sortedCountries = COUNTRY_IDS.slice();
	sortedCountries.sort();
	return {
		forward: COUNTRY_IDS.map(c => sortedCountries.indexOf(c)),
		backward: sortedCountries.map(c => COUNTRY_IDS.indexOf(c)),
	};
})();
const SERVER_URL = location.hostname === 'localhost' ? 'http://localhost:51822' : 'https://stickeralbumsrv.pommicket.com';
const textEncoder = new TextEncoder();

function simpleRequest(command, id) {
	const utf8 = textEncoder.encode(id);
	const body = new Uint8Array(utf8.length + 2);
	body[0] = command.charCodeAt(0);
	body.set(utf8, 1);
	body[body.length - 1] = 0x7f;
	return fetch(SERVER_URL, {
		method: 'POST',
		body
	});
}

/// Construct read-sticker-data fetch request
export function readRequest(publicID) {
	return simpleRequest('R', publicID);
}

/// Construct write-sticker-data fetch request
export function writeRequest(id, data) {
	const utf8 = textEncoder.encode(id);
	const body = new Uint8Array(utf8.length + data.length + 3);
	body[0] = 'w'.charCodeAt(0);
	body.set(utf8, 1);
	body.set([1], utf8.length + 1);
	body.set(data, utf8.length + 2);
	body[body.length - 1] = 0x7f;
	return fetch(SERVER_URL, {
		method: 'POST',
		body,
		keepalive: true,
	});
}

/// Construct register fetch request
export function registerRequest(id) {
	return simpleRequest('c', id);
}

/// Construct login fetch request
export function loginRequest(id) {
	return simpleRequest('l', id);
}

/// Create error string from response object
export async function formatResponseError(response) {
	console.assert(!response.ok);
	return `Error ${response.status}: ${await response.text().catch(e => e)}`;
}

/// Get "number code" of sticker #index in country (e.g. FWC, 0 -> 00)
export function stickerName(country, index) {
	if (country === 'FWC') {
		return index === 0 ? '00' : index+'';
	} else {
		return index+1+'';
	}
}

/// Convert sticker index to sticker code (e.g. 0 → FWC00)
export function stickerCode(index) {
	let country = COUNTRY_IDS[Math.floor(index / STICKERS_PER_COUNTRY)];
	return country + stickerName(country, index % STICKERS_PER_COUNTRY);
}

/// Get permutation_indicated_by_sortBy(index)
export function getSortPermutation(sortBy, index) {
	return sortBy === 'alphabetical' ? COUNTRY_ALPHABETICAL_ORDER.forward[index] : index;
}

/// Get permutation_indicated_by_sortBy^-1(index)
export function getSortInversePermutation(sortBy, index) {
	return sortBy === 'alphabetical' ? COUNTRY_ALPHABETICAL_ORDER.backward[index] : index;
}
