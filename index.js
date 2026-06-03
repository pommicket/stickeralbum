import { loginRequest, registerRequest, formatResponseError } from './common.js';

const MIN_LOGIN_LEN = 4;
const MAX_LOGIN_LEN = 80;
const LOGIN_LEN_ERROR = `Username must be ${MIN_LOGIN_LEN}-${MAX_LOGIN_LEN} characters long.`;
const loginID = document.getElementById("login-id");
const registerID = document.getElementById("register-id");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginButton = document.getElementById("login-button");
const registerButton = document.getElementById("register-button");
const loginError = document.getElementById("login-error");
const registerError = document.getElementById("register-error");

function startSubmit() {
	loginButton.disabled = true;
	registerButton.disabled = true;
	loginError.textContent = '';
	registerError.textContent = '';	
}

function submitError(which, err) {
	which.textContent = err;
	loginButton.disabled = false;
	registerButton.disabled = false;	
}

registerForm.addEventListener('submit', async e => {
	e.preventDefault();
	startSubmit();
	const id = registerID.value;
	if (id.length < MIN_LOGIN_LEN || id.length > MAX_LOGIN_LEN) {
		return submitError(registerError, LOGIN_LEN_ERROR);
	}
	let result = await registerRequest(id).catch(e => {
		submitError(registerError, e);
	});
	if (!result) { return; }
	if (!result.ok) {
		let errorMessage = await formatResponseError(result);
		submitError(registerError, errorMessage);
		return;
	}
	let publicID = await result.text().catch(e => {
		submitError(loginError, e);
	});
	if (!publicID) return;
	publicID = publicID.trim();
	localStorage.setItem('login', id);
	localStorage.setItem('publicID', publicID);
	location.href = 'collection.html';
});
loginForm.addEventListener('submit', async e => {
	e.preventDefault();
	startSubmit();
	const id = loginID.value;
	if (id.length < MIN_LOGIN_LEN || id.length > MAX_LOGIN_LEN) {
		return submitError(loginError, LOGIN_LEN_ERROR);
	}
	let result = await loginRequest(id).catch(e => {
		submitError(loginError, e);
	});
	if (!result) { return; }
	if (!result.ok) {
		let errorMessage = await formatResponseError(result);
		submitError(loginError, errorMessage);
		return;
	}
	let publicID = await result.text().catch(e => {
		submitError(loginError, e);
	});
	if (!publicID) return;
	localStorage.setItem('login', id);
	localStorage.setItem('publicID', publicID);
	location.href = 'collection.html';
});
