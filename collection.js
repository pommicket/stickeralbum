import { loginRequest, readRequest, writeRequest, formatResponseError, stickerName, COUNTRY_IDS, getSortPermutation } from "./common.js?v2";


const SAVE_INTERVAL = 5000;
let errorTimeout;
let publicID;
const sortBySelect = document.getElementById('sort-by');
const searchInput = document.getElementById('search-input');

function showError(e) {
	document.getElementById('error').textContent = e;
	if (errorTimeout !== undefined) {
		clearTimeout(errorTimeout);
	}
	errorTimeout = setTimeout(() => {
		document.getElementById('error').textContent = '';
	}, 10000);
}
function logout() {
	localStorage.removeItem('login');
	localStorage.removeItem('publicID');
	location.href = 'index.html';
}
async function getDataInner() {
	getting = true;
	let response = await readRequest(publicID);
	if (!response.ok) {
		throw await formatResponseError(response);
	}
	return await response.bytes();
}
let getting = false;
async function getData() {
	getting = true;
	try {
		return await getDataInner();
	} catch (e) {
		showError(e);
		throw e;
	} finally {
		getting = false;
	}
}
function updateData(newData) {
	for (let sticker of document.querySelectorAll('.sticker')) {
		let number = Number(sticker.dataset.number);
		let count = Math.min(99, newData[number]);
		// still include pending changes
		let newCount = count + Number(sticker.dataset.count) - Number(sticker.dataset.countSync);
		setCount(sticker, newCount);
		sticker.dataset.startCount = count; // NOT newCount
	}
	for (let country of document.querySelectorAll('.country')) {
		updateTotal(country);
	}
}
async function saveDataInner() {
	const changes = [];
	for (let sticker of document.querySelectorAll('.sticker')) {
		let id = Number(sticker.dataset.number);
		let delta = sticker.dataset.countSync - sticker.dataset.startCount;
		if (delta) {
			changes.push(id & 255, id >> 8, delta & 0xff);
		}
	}
	if (changes.length === 0) {
		return;
	}
	let response = await writeRequest(id, changes);
	if (response.ok) {
		let bytes = await response.bytes();
		saving = false;
		updateData(bytes);
	} else {
		throw await formatResponseError(response);
	}
}
let saving = false;
async function saveData() {
	if (saving) return;
	saving = true;
	await saveDataInner().catch(showError);
	saving = false;
}
const countries = (() => {
let countryInfo = `⚽ Special
🇲🇽 Mexico
🇿🇦 South Africa
🇰🇷 South Korea
🇨🇿 Czechia
🇨🇦 Canada
🇧🇦 Bosnia & Herzegovina
🇶🇦 Qatar
🇨🇭 Switzerland
🇧🇷 Brazil
🇲🇦 Morocco
🇭🇹 Haiti
🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland
🇺🇸 United States of America
🇵🇾 Paraguay
🇦🇺 Australia
🇹🇷 Türkiye
🇩🇪 Germany
🇨🇼 Curaçao
🇨🇮 Côte d’Ivoire
🇪🇨 Ecuador
🇳🇱 Netherlands
🇯🇵 Japan
🇸🇪 Sweden
🇹🇳 Tunisia
🇧🇪 Belgium
🇪🇬 Egypt
🇮🇷 Iran
🇳🇿 New Zealand
🇪🇸 Spain
🇨🇻 Cabo Verde
🇸🇦 Saudi Arabia
🇺🇾 Uruguay
🇫🇷 France
🇸🇳 Senegal
🇮🇶 Iraq
🇳🇴 Norway
🇦🇷 Argentina
🇩🇿 Algeria
🇦🇹 Austria
🇯🇴 Jordan
🇵🇹 Portugal
🇨🇩 Democratic Republic of the Congo
🇺🇿 Uzbekitan
🇨🇴 Colombia
🏴󠁧󠁢󠁥󠁮󠁧󠁿 England
🇭🇷 Croatia
🇬🇭 Ghana
🇵🇦 Panama`.split('\n');
COUNTRY_IDS.forEach(x => console.assert(x.length === 3));
console.assert(countryInfo.length == COUNTRY_IDS.length);
let countries = [];
for (let i = 0; i < countryInfo.length; i++) {
	let info = countryInfo[i];
	let id = COUNTRY_IDS[i];
	const space = info.indexOf(' ');
	countries.push({
		index: i,
		id,
		emoji: info.substring(0, space),
		name: info.substring(space + 1)
	});
}
return Object.freeze(countries);
})();

let stickerTemplate = document.getElementById('sticker-template').content.firstChild;
function updateTotal(elem) {
	while (!elem.classList.contains('country')) {
		elem = elem.parentElement;
	}
	let total = 0;
	for (let sticker of elem.querySelectorAll('.sticker')) {
		total += sticker.dataset.count > 0;
	}
	elem.querySelector('.countryCount').textContent = total;
	let totalTotal = 0;
	let rootContainer = elem;
	while (rootContainer.id !== 'sticker-container') {
		rootContainer = rootContainer.parentElement;
	}
	for (let country of rootContainer.querySelectorAll('.country')) {
		totalTotal += Number(country.querySelector('.countryCount').textContent);
	}
	if (!isNaN(totalTotal)) {
		document.getElementById('total-total').textContent = ' — ' + totalTotal + '/980';
	}
}
function stickerAdd() {
	if (this.parentElement.dataset.count < 100)
		setCount(this.parentElement, Number(this.parentElement.dataset.count) + 1);
	updateTotal(this);
}
function stickerSub() {
	if (this.parentElement.dataset.count > 0)
		setCount(this.parentElement, this.parentElement.dataset.count - 1);
	updateTotal(this);
}
function makeSticker(number, name, count) {
	let sticker = document.importNode(stickerTemplate, true);
	sticker.dataset.startCount = count;
	sticker.dataset.number = number;
	sticker.querySelector('.sticker-name').append(name+'');
	setCount(sticker, count);
	sticker.querySelector('.add').addEventListener('click', stickerAdd);
	sticker.querySelector('.sub').addEventListener('click', stickerSub);
	return sticker;
}
function setCount(sticker, count) {
	sticker.dataset.count = count;
	if (!(getting || saving)) {
		sticker.dataset.countSync = count;
	}
	let status = count <= 0 ? 'Missing' : count === 1 ? 'Have'
		: `${count - 1} dupe${count > 2 ? 's' : ''}`;
	sticker.querySelector('.sticker-status').textContent = status;
}
let currSortType, currSearchTerm;
function updateCountries() {
	let stickerContainer = document.getElementById('sticker-container');
	if (!stickerContainer) {
		return;
	}
	let sortType = sortBySelect.value;
	let searchTerm = searchInput.value.toLowerCase();
	if (sortType === currSortType && searchTerm == currSearchTerm) {
		return;
	}
	let countryElements = [];
	for (const country of document.querySelectorAll('.country')) {
		country.remove();
		countryElements.push(country);
	}
	countryElements.sort((a, b) => {
		let aIndex = Number(a.dataset.countryIndex);
		let bIndex = Number(b.dataset.countryIndex);
		return getSortPermutation(sortType, aIndex) - getSortPermutation(sortType, bIndex);
	});
	for (let country of countryElements) {
		country.hidden = searchTerm && !country.querySelector('h2').textContent.toLowerCase().includes(searchTerm);
		stickerContainer.append(country);
	}
	currSortType = sortType;
	currSearchTerm = searchTerm;
}

// for legacy connections
async function getPublicID() {
	publicID = localStorage.getItem('publicID');
	if (publicID) {
		return;
	}
	await (async () => {
		let result = await loginRequest(id);
		if (!result.ok) { throw 0; }
		publicID = await result.text();
		publicID = publicID.trim();
		if (!publicID) { throw 0; }
	})().catch(() => logout());
	localStorage.setItem('publicID', publicID);
}

getPublicID().then(() => getData()).then(data => {
	const container = document.createElement('div');
	container.id = 'sticker-container';
	let stickerNumber = 0;
	for (const country of countries) {
		const isFWC = country.id === 'FWC';
		const countrySection = document.createElement('div');
		countrySection.classList.add('country');
		countrySection.dataset.countryIndex = country.index;
		const countryHeader = document.createElement('h2');
		const countryCount = document.createElement('span');
		countryCount.classList.add('countryCount');
		countryHeader.append(country.emoji, country.id, ' — ', country.name, ' (', countryCount, '/20)');
		countrySection.append(countryHeader);
		let pageContainer = document.createElement('div');
		pageContainer.classList.add('page');
		let rowContainer = pageContainer;
		rowContainer = document.createElement('div');
		rowContainer.classList.add('row');
		let rowOffset;
		if (!isFWC) {
			rowOffset = 2;
		}
		pageContainer.append(rowContainer);
		countrySection.append(pageContainer);
		let rowStart = 0;
		for (let i = 0; i < 20; i++) {
			let name = stickerName(country.id, i);
			if (!isFWC) {
				let special = i === 0 ? '⚜️' : i === 12 ? '👥' : '';
				name = special + name;
			}
			let sticker = makeSticker(stickerNumber, name, data[stickerNumber]);
			if (rowOffset !== undefined) {
				sticker.style.gridColumn = rowOffset + (i - rowStart) + 1;
			}
			if (i === 12 && !isFWC) {
				sticker.classList.add('stickerTeam');
			} else if (i === 0 && !isFWC) {
				sticker.classList.add('emblem');
			}
			rowContainer.append(sticker);
			if (!isFWC && i === 9) {
				pageContainer = document.createElement('div');
				pageContainer.classList.add('page');
				countrySection.append(pageContainer);
			}
			if ((isFWC ? [3, 7, 11, 15] : [1, 5, 9, 12, 16]).includes(i)) {
				rowContainer = document.createElement('div');
				rowContainer.classList.add('row');
				rowOffset = undefined;
				if (!isFWC && i === 16) {
					rowOffset = 1;
				}
				rowStart = i + 1;
				pageContainer.append(rowContainer);
			}
			stickerNumber++;
		}
		container.append(countrySection);
		updateTotal(countrySection);
	}
	document.getElementById('main').append(container);
	updateCountries();
	sortBySelect.addEventListener('change', () => updateCountries());
	document.getElementById('loading').remove();
	setInterval(() => saveData(), SAVE_INTERVAL);
	document.addEventListener('visibilitychange', async () => {
		if (document.visibilityState === "hidden") {
	  		await saveData();
		}
	});
	document.addEventListener('pagehide', async () => {
		await saveData();
	});
	
});

document.getElementById('logout-form').addEventListener('submit', e => {
	e.preventDefault();
	logout();
});
document.getElementById('show-missing').addEventListener('click', () => {
	location.href = `list.html?missing=${publicID}`;
});
document.getElementById('show-dupes').addEventListener('click', () => {
	location.href = `list.html?duplicates=${publicID}`;
});
searchInput.addEventListener('input', () => updateCountries());
