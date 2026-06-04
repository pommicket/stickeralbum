import { readRequest, formatResponseError, STICKERS_PER_COUNTRY, COUNTRY_IDS, getSortInversePermutation, stickerCode } from "./common.js";
// show "just missing" / "just duplicates"
const publicID = searchParams.get('missing') || searchParams.get('duplicates');
if (!publicID) location.href = '404.html';
const sortBySelect = document.getElementById('sort-by');
readRequest(publicID).then(async response => {
	if (!response.ok) {
		throw await formatResponseError(response);
	}
	let data = await response.bytes();
	console.assert(data.length === COUNTRY_IDS.length * STICKERS_PER_COUNTRY);
	let checkMissing = searchParams.has('missing');
	function updateList() {
		const sortBy = sortBySelect.value;
		listContainer.replaceChildren();
		for (let c = 0; c < COUNTRY_IDS.length; c++) {
			let country = getSortInversePermutation(sortBy, c);
			for (let s = 0; s < STICKERS_PER_COUNTRY; s++) {
				const i = country * STICKERS_PER_COUNTRY + s;
				const n = data[i];
				if (!(checkMissing ? n === 0 : n > 1)) continue;
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
	}
	sortBySelect.addEventListener('change', updateList);
	updateList();
}).catch(e => {
	document.getElementById('error').textContent = e;
});
