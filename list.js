import { readRequest, formatResponseError, STICKERS_PER_COUNTRY, COUNTRY_IDS, stickerCode } from "./common.js";
// show "just missing" / "just duplicates"
const publicID = searchParams.get('missing') || searchParams.get('duplicates');
if (!publicID) location.href = '404.html';

readRequest(publicID).then(async response => {
	if (!response.ok) {
		throw await formatResponseError(response);
	}
	let data = await response.bytes();
	listContainer.replaceChildren();
	console.assert(data.length === COUNTRY_IDS.length * STICKERS_PER_COUNTRY);
	let checkMissing = searchParams.has('missing');
	for (let i = 0; i < data.length; i++) {
		let n = data[i];
		if (checkMissing ? n === 0 : n > 1) {
			let sticker = document.createElement('div');
			sticker.textContent = stickerCode(i);
			if (n > 2) {
				let dupCount = document.createElement('span');
				dupCount.classList.add('dup-count');
				dupCount.textContent = '×' + (n-1);
				sticker.append(dupCount);
			}
			listContainer.append(sticker);
		}
	}
}).catch(e => {
	document.getElementById('error').textContent = e;
});
