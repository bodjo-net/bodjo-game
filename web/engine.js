Loading.header(GAME_SERVER, 'v' + LIB_VERSION);
Object.getOwnPropertyNames(Math).forEach(k => window[k] = Math[k]);
function arr(args) {
	return Array.prototype.slice.apply(args);
}

document.querySelector('title').innerHTML = GAME_NAME + " (" + GAME_SERVER + ")";

let loaded = false;

let workspace = document.querySelector('#workspace');
let game = document.querySelector('#game');
let scoreboard = document.querySelector('#scoreboard-page');

let canvasContainer = game.querySelector('#canvas-container');
let canvas = window.canvas = canvasContainer.querySelector('canvas');
let ctx = window.ctx = canvas.getContext('2d');

let errorsContainer = workspace.querySelector('#errors');
let controlsContainer = workspace.querySelector('#controls');

const domain = getDomain();
const webrtcOptions = {
	iceServers: [
		//{urls:['stun:localhost:3478']}
		//{urls:['stun:stun.l.google.com:19302']}//,
		// {urls:['stun:stun1.l.google.com:19302']},
		// {urls:['stun:stun2.l.google.com:19302']},
		// {urls:['stun:stun3.l.google.com:19302']},
		// {urls:['stun:stun4.l.google.com:19302']}
	]
};

class Bodjo extends EventEmitter {
	constructor() {
		super();
		this.ids = {};
		this.__renderArguments = [];
		this.__controls = null;
		this.storage = {
			get: function (name) {
				let o = null;
				if (getCookie(name)) {
					o = getCookie(name);
					if (typeof localStorage.getItem(name) === 'undefined')
						localStorage.setItem(name, o);
				} else if (localStorage.getItem(name)) {
					o = localStorage.getItem(name);
					setCookie(name, o, {domain});
				}
				if (o != null) {
					try {
						o = JSON.parse(o)
					} catch (e) {}
				}
				return o;
			},
			set: function (name, value) {
				localStorage.setItem(name, JSON.stringify(value));
				setCookie(name, JSON.stringify(value), {domain});
			}
		}
	}
	callResizeRender() {
		if (typeof this.render === 'function')
			this.render.apply(this, 
				[canvas, ctx, this.resizeCanvas, false]
						.concat(this.__renderArguments||[])
			);
	}
	callRender() {
		let args = arr(arguments);
		this.__renderArguments = args;
		this.render.apply(this, 
			[canvas, ctx, this.resizeCanvas, true]
				.concat(this.__renderArguments)
		);
	}

	set controls (controls) {
		this.__controls = controls;
		controlsContainer.innerHTML = "";
		for (let i = 0; i < controls.length; ++i) {
			let control = controls[i];
			let element = control.html();
			controlsContainer.appendChild(element);
		}

		resizeUI();
	}

	getControl(name) {
		for (let i = 0; i < this.__controls.length; ++i)
			if (this.__controls[i].name == name)
				return this.__controls[i];
		return null;
	}

	renderScoreboard(headers, data) {
		let html = '<table><tbody>';

		html += '<tr>';
		for (let i = 0; i < headers.length; ++i)
			html += '<th>' + headers[i] + '</th>';
		html += '</tr>';

		for (let i = 0; i < data.length; ++i) {
			html += '<tr>';
			for (let j = 0; j < data[i].length; ++j) {
				html += '<td>' + data[i][j] + '</td>';
			}
			html += '</tr>';
		}

		scoreboard.innerHTML = html;

		setTimeout(updateOnline, 10);
	}

	showError(err, timeout = 5000) {
		let string = err.toString();
		if (err instanceof Error) {
			let stack = err.stack.replace(/^ +at/gm, '- at');
			if (stack.split(/\n/g)[0] == string) {
				string = stack;
			} else
				string += stack;
		}

		let newError = document.createElement('div');
		newError.className = 'error btn hide';
		newError.innerText = string;
		let loader = document.createElement('div');
		loader.className = 'loader';
		loader.style.animationDuration = timeout/1000 + 's';
		newError.appendChild(loader);
		errorsContainer.appendChild(newError);

		let removeRipple = null;
		if (typeof obtainWithRipple === 'function')
			removeRipple = obtainWithRipple(newError);
		let marker = null;

		setTimeout(function () {
			removeClass(newError, 'hide');
		}, 10);

		function hide() {
			if (marker != null)
				bodjo.editor.getSession().removeMarker(marker);
			addClass(newError, 'hide');
			setTimeout(function () {
				newError.remove();
			}, 200);
		}

		let stopped = false;
		setTimeout(function () {
			if (!stopped)
				hide();
		}, timeout);
		newError.addEventListener('mouseup', function onClick() {
			if (stopped)
				return;
			stopped = true;
			addClass(newError, 'stopped');
			if (removeRipple != null)
				removeRipple();

			let closeBtn = document.createElement('div');
			closeBtn.className = 'close';
			closeBtn.appendChild(document.createElement('span'));
			closeBtn.appendChild(document.createElement('span'));
			newError.appendChild(closeBtn);
			closeBtn.addEventListener('click', hide);
		});

		if (!err.stack)
			return;
		let match = err.stack.match(/at eval \(eval at compile \(.+\), \<anonymous\>:(\d+):(\d+)\)|Function:(\d+):(\d+)/);
		if (match == null || match.length < 3)
			return;
		let row = range(parseInt(match[1]||match[3])-3, 0, Infinity);
		let column = parseInt(match[2]||match[4]);
		marker = bodjo.editor.getSession().addMarker(new ace.Range(row,column,row,200), "bodjo-error", "fullLine");
	}

	showNotification(text, timeout = 5000) {
		let newNotificaiton = document.createElement('div');
		newNotificaiton.className = 'notification btn hide';
		newNotificaiton.innerText = text;
		let loader = document.createElement('div');
		loader.className = 'loader';
		loader.style.animationDuration = timeout/1000 + 's';
		newNotificaiton.appendChild(loader);
		errorsContainer.appendChild(newNotificaiton);

		let removeRipple = null;
		if (typeof obtainWithRipple === 'function')
			removeRipple = obtainWithRipple(newNotificaiton);

		setTimeout(function () {
			removeClass(newNotificaiton, 'hide');
		}, 10);

		function hide() {
			addClass(newNotificaiton, 'hide');
			setTimeout(function () {
				newNotificaiton.remove();
			}, 200);
		}

		let stopped = false;
		setTimeout(function () {
			if (!stopped)
				hide();
		}, timeout);
		newNotificaiton.addEventListener('mouseup', function onClick() {
			if (stopped)
				return;
			stopped = true;
			addClass(newNotificaiton, 'stopped');
			if (removeRipple != null)
				removeRipple();

			let closeBtn = document.createElement('div');
			closeBtn.className = 'close';
			closeBtn.appendChild(document.createElement('span'));
			closeBtn.appendChild(document.createElement('span'));
			newNotificaiton.appendChild(closeBtn);
			closeBtn.addEventListener('click', hide);
		});
	}

	showDialog(id) {
		document.querySelector('#'+id).style.display = 'block';
	}
}
window.bodjo = new Bodjo();

let langs = ['en', 'ru'], loadings = [];
bodjo.lang = bodjo.storage.get('bodjo-lang') || 'en';
if (langs.indexOf(bodjo.lang) < 0)
	bodjo.lang = langs[0];
loadBodjoPage('docs.games.'+GAME_NAME+'.'+bodjo.lang, '#docs-page');
GET('/text.json', (status, text) => {
	if (status) {
		let labels = text[bodjo.lang];
		for (let selector in labels) {
			if (selector == 'loadings') {
				loadings = labels[selector];
				continue;
			}
			let s = document.querySelector(selector);
			if (s != null)
				s.innerHTML = labels[selector];
		}
	}
});

bodjo.resizeCanvas = function (aspectRatio) {
	if (typeof aspectRatio !== 'number') {
		if (typeof window.aspectRatio === 'undefined')
			window.aspectRatio = 1;
		aspectRatio = window.aspectRatio;
	} else
		window.aspectRatio = aspectRatio;

	// a = width / height
	// rwidth = height * a
	// rheight = width / a
	let w = canvasContainer.clientWidth,
		h = canvasContainer.clientHeight;

	let rw = h * aspectRatio,
		rh = w / aspectRatio;

	let W, H;
	if (h < rh) {
		W = rw;
		H = rw / aspectRatio;
		canvas.style.top = '0';
		canvas.style.left = (w - W) / 2 + 'px';
	} else {
		H = rh;
		W = rh * aspectRatio;
		canvas.style.top = (h - H) / 2 + 'px';
		canvas.style.left = '0';
	}

	canvas.width = W * window.devicePixelRatio;
	canvas.height = H * window.devicePixelRatio;
	canvas.style.width = W + 'px';
	canvas.style.height = H + 'px';
}
bodjo.resizeCanvas();
window.addEventListener('resize', function () {
	bodjo.resizeCanvas();
	bodjo.callResizeRender();
});

let container = workspace.querySelector("#container"); 
let bar = workspace.querySelector('#bar');
let tabsContainer = bar.querySelector("#tabs-container");
let tabs = Array.prototype.slice.apply(tabsContainer.querySelectorAll(".tab"));
let pages = Array.from(tabs, function (tab) {
	return container.querySelector("#" + tab.id.substring(0, tab.id.length-4) + "-page");
});
tabs.forEach(function (tab) {
	let pagename = tab.id.substring(0, tab.id.length-4);
	tab.addEventListener('mouseup', makeActive.bind(null, pagename));
});
function makeActive(pagename) {
	bodjo.storage.set('active-tab', pagename);
	pages.forEach(function (page) {
		if (pagename+'-page' == page.id)
			addClass(page, 'active')
		else removeClass(page, 'active');
	});
	tabs.forEach(function (tab) {
		if (pagename+'-tab' == tab.id)
			addClass(tab, 'active')
		else removeClass(tab, 'active');
	});
	if (loaded)
		resizeUI();
}
makeActive(bodjo.storage.get('active-tab') || 'docs');
let codeTab = tabs.find(tab => tab.id == 'code-tab');

// code
let codeWrapper = workspace.querySelector("#code-wrapper");
let codeContainer = codeWrapper.querySelector('#code');
bodjo.editor = ace.edit(codeContainer, {
	mode: 'ace/mode/javascript'
});
bodjo.editor.setFontSize(bodjo.storage.get('code-font-size') || 20);
window.addEventListener('keydown', function (e) {
	if ((e.keyCode == 187 || e.keyCode == 189) && (e.metaKey || e.altKey)) {
		// e.stopPropagation();
		let newFontSize = range(bodjo.editor.getFontSize() + 2*(e.keyCode==187?1:-1), 10, 50);
		bodjo.editor.setFontSize(newFontSize);
		bodjo.storage.set('code-font-size', newFontSize);
		// return false;
	}
});

let interval = null;
function resizeUI() {
	if (tabs.length > 0) {
		let className = tabsContainer.className;
		tabsContainer.className = (tabs[0].clientHeight+15 < tabsContainer.clientHeight ? 'multiline' : '');
		if (className != tabsContainer.className) {
			if (interval != null) {
				clearInterval(interval);
				interval = null;
			}

			interval = setInterval(function () {
				container.style.top = bar.clientHeight + "px";
			}, 16);
			setTimeout(function () {
				if (interval != null) {
					clearInterval(interval);
					interval = null;
				}
			}, 100);
		}
	}

	container.style.top = bar.clientHeight + "px";
	codeWrapper.style.bottom = controlsContainer.clientHeight + "px";
	if (bodjo.editor)
		bodjo.editor.resize();
}
window.addEventListener('resize', resizeUI);
resizeUI();

function addClass(element, className) {
	let classes = element.className.split(/ /g);
	if (classes.indexOf(className) >= 0)
		return;
	classes.push(className);
	element.className = classes.join(' ');
}
function removeClass(element, className) {
	let classes = element.className.split(/ /g);
	if (classes.indexOf(className) < 0)
		return;
	while (classes.indexOf(className) >= 0)
		classes.splice(classes.indexOf(className), 1);
	element.className = classes.join(' ');
}

let resizer = document.querySelector('#resizer');
let resizing = false;
resizer.addEventListener('mousedown', onMouseDown);
resizer.addEventListener('mouseup', onMouseUp);
document.body.addEventListener('mousemove', onMouseMove);
document.body.addEventListener('mouseup', onMouseUp);
window.addEventListener('mouseup', onMouseUp);

let workspaceWidth = bodjo.storage.get('bodjo-workspace-width-'+GAME_NAME) || 400;
if (workspaceWidth != 400)
	updateWorkspaceWidth();
function onMouseDown() {
	resizing = true;
	clearSelection();
}
function onMouseUp() {
	resizing = false;
}
function onMouseMove(e) {
	if (!resizing) return;
	
	workspaceWidth = range(e.clientX, 150, window.innerWidth - 150);
	updateWorkspaceWidth();
}
function updateWorkspaceWidth() {
	bodjo.storage.set('bodjo-workspace-width-'+GAME_NAME, workspaceWidth);
	workspace.style.width = workspaceWidth + 'px';
	game.style.left = workspaceWidth + 'px';
	resizeUI();
	bodjo.resizeCanvas();
	bodjo.callResizeRender();
}
function range(x, _min, _max) {
	return Math.max(Math.min(x, _max), _min);
}
function clearSelection() {
	if (window.getSelection)
		window.getSelection().removeAllRanges();
	else if (document.selection)
		document.selection.empty();
}

let socket, psocket, peer, channel;
window.addEventListener('load', function () {
	GET('https://bodjo.net/SERVER_HOST', (status, hostname) => {
		if (status) {
			SERVER_HOST = hostname;
			Loading.put(loadings[13] + SERVER_HOST);
		}
		getCredentials(credentials => connect(credentials));
		loaded = true;
		loadCode();

		bodjo.callResizeRender();
	});
});

let TOKEN = bodjo.storage.get('bodjo-token');
let SERVER_HOST = null;

// code saver
let codeChanged = false;
window.addEventListener('keydown', function (e) {
	if (e.keyCode == 83 && e.ctrlKey) {
		e.stopPropagation();
		e.preventDefault();
		saveCode();
		return false;
	}
});

bodjo.editor.on('change', function onCodeChange() {
	changeCodeChange(true);
});

let _S = 0;
function changeCodeChange(val) {
	codeChanged = val;
	if (codeTab) {
		let classes = codeTab.className.split(/ /g);
		if (codeChanged && classes.indexOf('not-saved') < 0)
			classes.push('not-saved');
		if (!codeChanged && classes.indexOf('not-saved') >= 0)
			classes.splice(classes.indexOf('not-saved'), 1);
		codeTab.className = classes.join(' ');
		let text = codeTab.innerText;
		if (codeChanged && text[text.length-1] != '*')
			codeTab.innerText = text = text + '*';
		if (!codeChanged && text[text.length-1] == '*')
			codeTab.innerText = text = text.substring(0, text.length-1);
	}

	let __S = _S = Math.random()*999;
	setTimeout(() => {
		if (_S == __S && codeChanged)
			saveCode(true, true);
	}, 10000);
}

let lastSaved = -1;
function saveCode(uploadToMainServer, auto) {
	if (typeof uploadToMainServer === 'undefined')
		uploadToMainServer = true;
	if (typeof auto === 'undefined')
		auto = false;
	lastSaved = Date.now();

	changeCodeChange(false)
	bodjo.storage.set('bodjo-code-time-'+GAME_NAME, Date.now());
	bodjo.storage.set('bodjo-code-selection-'+GAME_NAME, bodjo.editor.selection.toJSON());
	bodjo.storage.set('bodjo-code-username-'+GAME_NAME, bodjo.storage.get('bodjo-username'));
	localStorage.setItem('bodjo-code-'+GAME_NAME, JSON.stringify(bodjo.editor.getValue()));

	if (uploadToMainServer && !codeChanged) {
		POST(SERVER_HOST + '/code/save?game=' + GAME_NAME + '&token=' + TOKEN, req => {
			// req.setRequestHeader("Content-Type", "plain/text");
			req.send(bodjo.editor.getValue());
		}, (status, data) => {
			if (status && data.status == 'ok') {
				console.log('code saved. (uploaded to main server)');

				bodjo.showNotification('Code saved. (Uploaded to server)', auto?1000:2500);
			} else {
				if (!status)
					console.warn('failed to save code: bad http response ' + data.statusCode + ': ' + data.statusText);
				else
					console.warn('failed to save code: bad api response', data);
			}
		})
	}
}

function loadCode() {
	let currentUsername = bodjo.storage.get('bodjo-username');
	let localCodeTime = bodjo.storage.get('bodjo-code-time-'+GAME_NAME);
	let localCodeUsername = bodjo.storage.get('bodjo-code-username-'+GAME_NAME);
	let localCode = JSON.parse(localStorage.getItem('bodjo-code-'+GAME_NAME));
	let selection = bodjo.storage.get('bodjo-code-selection-'+GAME_NAME);
	GET(SERVER_HOST + '/code/date?game=' + GAME_NAME + '&token=' + TOKEN, (status, data) => {
		if (status) {
			let serverCodeTime = data.result || 0;
			if (data.status !== 'ok') {
				if (typeof localCodeTime === 'number' &&
					typeof localCode === 'string' &&
					currentUsername == localCodeUsername) {
					bodjo.editor.setValue(localCode, 1);
					if (selection)
						bodjo.editor.selection.fromJSON(selection);
					changeCodeChange(false);
					saveCode();
					console.log('code loaded from localStorage');
				} else {
					loadDefaultCode(defaultCode => {
						bodjo.editor.setValue(defaultCode, 1);
						changeCodeChange(false);
						saveCode(false);
						console.log('code loaded from default-code');
					})
				}
			} else {
				if (typeof localCodeTime === 'number' &&
					typeof localCode === 'string' &&
					Math.round(localCodeTime / 1000) >= Math.round(serverCodeTime / 1000) &&
					currentUsername == localCodeUsername) {

					bodjo.editor.setValue(localCode, 1);
					if (selection)
						bodjo.editor.selection.fromJSON(selection);
					saveCode(false);
					changeCodeChange(false);
					console.log('code loaded from localStorage');

				} else {
					GET(SERVER_HOST + '/code/load?game=' + GAME_NAME + '&token=' + TOKEN, (status, data) => {
						if (status && data.status === 'ok') {
							bodjo.storage.set('bodjo-code-time', data.date);
							localStorage.setItem('bodjo-code-'+GAME_NAME, JSON.stringify(data.content));

							bodjo.editor.setValue(data.content, 1);
							saveCode(false);
							changeCodeChange(false);
							if (selection)
								bodjo.editor.selection.fromJSON(selection);
							console.log('code loaded from main server');
						}
					});
				}
			}
		} else {
			console.warn('loadCode(): bad http response');
			if (typeof localCode === 'string')
				bodjo.editor.setValue(localCode, 1);
			if (selection)
				bodjo.editor.selection.fromJSON(selection);
			changeCodeChange(false)
		}
	})
}
function loadDefaultCode(cb) {
	GET('/default-code.js', (status, data) => {
		if (status) {
			cb(data);
		} else {
			cb('/*\n\tplease, specify default code.\n\tcreate "default-code.js" in the root of your client folder.\n*/')
		}
	}, false);
}
function getDomain() {
	return (window.location.hostname.match(/\./g)||[]).length > 1 ? window.location.hostname.substring(window.location.hostname.indexOf('.')+1) : window.location.hostname;
}
function getCredentials(cb) {
	let credentials = {};
	credentials.role = 'player';//window.location.pathname.indexOf('spectate') >= 0 ? 'spectator' : 'player';
	if (DEV) {
		Loading.put(loadings[9]);
		credentials.username = bodjo.username = prompt('Username: ');
		credentials.token = Math.round(Math.random()*9999999+99999) + '';
		cb(credentials);
	} else {
		let username;
		let hash = window.location.hash.substring(1);
		if (hash.length > 0) {
			window.location.hash = '';
		}
		if (hash.length > 0 && hash.indexOf(':') >= 0) {
			username = hash.substring(0, hash.indexOf(':'));
			let token = hash.substring(hash.indexOf(':')+1);
			bodjo.storage.set('bodjo-username', username);
			bodjo.storage.set('bodjo-token', token);
			TOKEN = token;
			Loading.put(loadings[9]);
		} else {
			let gameToken = bodjo.storage.get('bodjo-game-token-'+GAME_SERVER);
			username = bodjo.storage.get('bodjo-username');
			if (!!gameToken && !!username) {
				credentials.username = username;
				credentials.token = gameToken;
				credentials.probable = true;
				bodjo.username = username;
				if (hash.length > 0)
					window.location.hash = '';
				Loading.put(loadings[10]);
				cb(credentials);
				return;
			}
			TOKEN = bodjo.storage.get('bodjo-token');
		}

		
		if (!TOKEN) {
			console.error("token in cookie and localStorage and hash wasn't found.");
			bodjo.showDialog('missing-token-dialog');
			return;
		}

		GET(SERVER_HOST + '/games/join?name=' + GAME_SERVER + '&token=' + TOKEN, (status, data) => {
			if (!status) {
				console.warn("/games/join/: bad http response " + data.statusCode + ": " + data.statusText);
				return;
			}

			if (data.status !== 'ok') {
				console.warn('/games/join/: bad api response ' + data.statusCode + ': ' + data.statusText);
				if (data.errParameter == 'token') {
					bodjo.showDialog('missing-token-dialog');
				}
				return;
			}

			username = data.username;
			gameToken = data.gameSessionToken;
			bodjo.storage.set('bodjo-game-token-'+GAME_SERVER, gameToken);
			bodjo.storage.set('bodjo-username', username);
			credentials.username = username;
			credentials.token = gameToken;
			bodjo.username = username;
			cb(credentials);
		});
	}
}
let closing = false;
function connect(credentials) {
	let path = window.location.protocol+'//'+window.location.host+'?'+
		Object.keys(credentials).map(k => k + '=' + encodeURIComponent(credentials[k])).join('&');
	console.log('connecting to ' + path);
	socket = io(path);
	socket.on('error', function (err) {
		let errobj;
		try {
			errobj = JSON.parse(err);
		} catch (errp) {
			console.error(err);
			return;
		}

		if (errobj.status == 'err') {
			Loading.put(loadings[8] + errobj.reasonid);
			switch (errobj.reasonid) {
				case 0: // "role" and "username" should be passed in query
				case 5: // role should be "spectator" or "player"
				case 3: // gameSessionToken in query is not found (key "token")
					console.error('[socket] connection error (bad query)', errobj);
					break;
				case 1: // player is not found (role=spectator)
					console.error('[socket] player is not found (redirecting)', errobj);
					// TODO: redirect
					break;
				// case 2: // player has already connected (role=player)
				// 	console.error('[socket] player has already connected', errobj);
				// 	break;
				case 4: // gameSessionToken is invalid
					console.error('[socket] bad gameSessionToken', errobj);
					if (credentials.probable) {
						bodjo.storage.set('bodjo-game-token-'+GAME_SERVER, null);
						getCredentials(credentials => connect(credentials));
					}
					break;
				case 6: // max players
					bodjo.showDialog('max-players-dialog');
					console.error('[socket] max players');
					break;
				default:
					console.error('[socket] unknown error', errobj);
			}
		}
	});
	let closeSocketEvent = function () {
		console.log('beforeunload => socket close');
		socket.close();
		closing = true;
	}
	socket.on('connect', () => {
		window.addEventListener("beforeunload", closeSocketEvent, false);
		var onevent = socket.onevent;
		socket.onevent = function (packet) {
		    var args = packet.data || [];
		    onevent.call (this, packet);
		    packet.data = ["*"].concat(args);
		    onevent.call(this, packet);
		};
	});
	socket.on('disconnect', () => {
		window.removeEventListener("beforeunload", closeSocketEvent, false);
	});

	let bufferedMessages = [];

	Loading.put(loadings[0]);
	socket.on('connect', () => {
		Loading.put(loadings[1]);
		peer = new RTCPeerConnection(webrtcOptions);
		peer.ondatachannel = (event) => {
			channel = event.channel;
			Loading.put(loadings[4]);
			channel.onopen = () => {
				Loading.put(loadings[5]);
				Loading.hide();
				psocket = new PseudoSocket(socket, peer, channel);
				psocket.on('online', updateOnline);
				bodjo.emit('connect', psocket);

				for (let i = 0; i < bufferedMessages.length; ++i)
					psocket.emitter.emit.apply(psocket.emitter, bufferedMessages[i]);
				bufferedMessages = [];

			}
		};
		peer.onicecandidate = (event) => {
			if (event && event.candidate) {
				Loading.put(loadings[6] + ' (' + event.candidate.protocol + ')');
				socket.emit('candidate', event.candidate);
			}
		};
	});
	socket.on('*', function () {
		let args = Array.prototype.slice.apply(arguments);
		if (psocket != null) {
			psocket.emitter.emit.apply(psocket.emitter, args);
		} else 
			bufferedMessages.push(args);
	});
	socket.on('disconnect', () => {
		if (closing)
			return;
		Loading.show();
		Loading.put(loadings[12]);
	})
	socket.on('candidate', (candidate) => {
		Loading.put(loadings[7] + ' (' + candidate.protocol + ')');
		peer.addIceCandidate(new RTCIceCandidate(candidate));
	});
	socket.on('offer', (offer) => {
		Loading.put(loadings[2]);
		peer.setRemoteDescription(offer);
		peer.createAnswer()
			.then((answer) => {
				Loading.put(loadings[3]);
				peer.setLocalDescription(answer);
				socket.emit('answer', answer);
			})
			.catch(console.error);
	});

	socket.on('new-tab', () => {
		bodjo.showDialog('new-tab-dialog');
	});
	socket.on('_scoreboard', (scoreboard) => {
		scoreboard.forEach(player => bodjo.ids[player.id] = player.username);
		bodjo.emit('scoreboard', scoreboard.filter(player => !/^bot/g.test(player.username)));
	});

	// let oldEmit = socket.emit;
	// socket.emit = function () {
	// 	bodjo.emit.apply(bodjo, arr(arguments).concat([socket]));
	// 	oldEmit.apply(socket, arr(arguments));
	// }
	return socket;
}
class PseudoSocket {
	constructor(socket, peer, channel) {
		this.emitter = new EventEmitter();

		this.socket = socket;
		this.peer = peer;
		this.channel = channel;

		channel.onmessage = (event) => {
			if (event.type != 'message' ||
				!(event.data instanceof ArrayBuffer))
				return;

			try {
				let buff = event.data;
				let len = (new Uint8Array(buff.slice(0, 1)))[0];
				let lens = new Uint16Array(buff.slice(1, 1+len*2));
				let buffs = new Array(len);
				for (let i = 0, j = 1 + len * 2; i < len; ++i) {
					buffs[i] = buff.slice(j, j + lens[i]);
					j += lens[i];
				}
				let elements = new Array(len);
				for (let i = 0; i < len; ++i) {
					let type = (new Uint8Array(buffs[i].slice(0, 1)))[0];
					if (type == 0) {
						elements[i] = ab2str(buffs[i].slice(1));
					} else if (type == 1) {
						elements[i] = JSON.parse(ab2str(buffs[i].slice(1)));
					} else if (type == 2) {
						elements[i] = (new Int16Array(buffs[i].slice(1)))[0];
					} else if (type == 3) {
						elements[i] = buffs[i].slice(1);
					}
				}
				if (elements.length > 0 && 
					typeof elements[0] === 'string')
					this.emitter.emit.apply(this.emitter, elements);
			} catch (e) {
				console.error(e);
			}
		}
		channel.onclose = () => {
			this.emitter.emit('disconnect');
			if (this.peer.connectionState == 'connected')
				this.peer.close();
			if (this.socket.connected)
				this.socket.close();
		}
	}

	emit() {
		let data = arr(arguments);

		let buffers = data.map(B);
		let u = new Array(buffers.length*2 + 1);
		u[0] = Uint8(buffers.length);
		for (let i = 0; i < buffers.length; ++i)
			u[1 + i] = Uint16(buffers[i].byteLength);
		for (let i = 0; i < buffers.length; ++i)
			u[1 + buffers.length + i] = buffers[i];

		let buffer = concat.apply(this, u);
		if (this.channel != null)
			this.channel.send(buffer);
	}

	on() {
		this.emitter.on.apply(this.emitter, arr(arguments));
	}
	once() {
		this.emitter.once.apply(this.emitter, arr(arguments));
	}
}

function Button(name, callback) {
	let button = {
		name: name,
		__element: null,
		__isActive: false,
		html: function () {
			let div = document.createElement('div');
			div.className = 'Button btn';
			div.id = name;
			div.style.backgroundImage = 'url(/ui/'+name+'.png)';
			div.addEventListener('mouseup', callback);
			button.__element = div;
			if (typeof obtainWithRipple === 'function')
				obtainWithRipple(div);
			return div;
		},
		setActive: function (bool) {
			if (button.__element == null)
				return;

			button.__isActive = bool;
			button.__element.className = 'Button btn' + (button.__isActive ? ' active' : '');
		}
	};
	return button;
}
function Slider(name, _min, _max, callback) {
	let slider = {
		name: name,
		__input: null,
		__p: null,
		html: function () {
			let panel = document.createElement('div');
			panel.className = 'panel';
			panel.id = name;

			let image = document.createElement('div');
			image.className = 'img';
			image.style.backgroundImage = 'url(/ui/'+name+'.png)';
			panel.appendChild(image);

			let input = document.createElement('input');
			input.type = 'range';
			input.min = _min;
			input.max = _max;
			slider.__input = input;
			panel.appendChild(input);

			let p = document.createElement('p');
			slider.__p = p;
			panel.appendChild(p);

			input.addEventListener('change', function (e) {
				e.stopPropagation();
				slider.__p.innerText = input.value;
				callback(input.value);
			});
			input.addEventListener('input', function (e) {
				e.stopPropagation();
				slider.__p.innerText = input.value;
				callback(input.value);
			});

			return panel;
		},
		set: function (value) {
			value = range(value, _min, _max);
			if (slider.__input != null)
				slider.__input.value = value;
			if (slider.__p != null)
				slider.__p.innerText = value;
		}
	};
	return slider;
}
function Select(name, options, callback) {
	let select = {
		name: name,
		__select: null,
		html: function () {
			let panel = document.createElement('div');
			panel.className = 'panel';
			panel.id = name;

			let image = document.createElement('div');
			image.className = 'img';
			image.style.backgroundImage = 'url(/ui/'+name+'.png)';
			panel.appendChild(image);

			let selectElement = document.createElement('select');
			for (let i = 0; i < options.length; ++i) {
				let option = document.createElement('option');
				option.innerText = options[i];
				selectElement.appendChild(option);
			}
			select.__select = selectElement;
			selectElement.addEventListener('change', function () {
				callback(selectElement.selectedIndex);
			});

			panel.appendChild(selectElement);
			return panel;
		},
		set: function (index) {
			if (select.__select != null)
				select.__select.selectedIndex = index;
		}
	};
	return select;
}

let lastOnlineList = null
function updateOnline(onlines) {
	if (typeof onlines === 'undefined') {
		if (lastOnlineList == null)
			return;
		onlines = lastOnlineList;
	}
	lastOnlineList = onlines;
	let players = document.querySelectorAll('.bodjo-player');
	for (let i = 0; i < players.length; ++i) {
		let player = players[i];
		let username = player.getAttribute('username');
		let online = onlines.indexOf(username) >= 0;
		if (online)
			addClass(player, 'online');
		else
			removeClass(player, 'online');
	}
}

let playersData = {};
let playersToLoad = {};
let lastRequest = 0;
function Player(username) {
	if (typeof playersData[username] !== 'undefined') {
		if (playersData[username] == null)
			return "<div class='bodjo-player' username='"+username+"'><span class='image'><span></span></span><span class='username'>"+username+"</span></div>";
		return "<div class='bodjo-player' username='"+username+"'><span class='image' style=\"background-image:url('"+playersData[username].image[64]+"');\"><span></span></span><span class='username'>"+username+"</span></div>";
	}

	let id = 'p' + ~~(Math.random() * 999999 + 999999);
	lastRequest = Math.random();
	let wasLastRequest = lastRequest;
	playersToLoad[username] = id;
	setTimeout(function () {
		if (lastRequest == wasLastRequest && Object.keys(playersToLoad).length > 0) {
			GET(SERVER_HOST+'/account/info?usernames=' + Object.keys(playersToLoad).join(','), (status, data) => {
				if (status && data.status === 'ok') {
					let usernames = Object.keys(data.result)
					for (let i = 0; i < usernames.length; ++i) {
						let userinfo = data.result[usernames[i]];
						playersData[usernames[i]] = userinfo;

						if (userinfo != null) {
							let playerElement = document.querySelector('#'+playersToLoad[usernames[i]]);
							if (playerElement == null)
								continue;
							playerElement.querySelector('span.image').style.backgroundImage = "url('"+userinfo.image[64]+"')";
							playerElement.className = 'bodjo-player';
						}
					}
					playersToLoad = {};
				}
			})
		}
	}, 100);

	return "<div class='bodjo-player loading' id='"+id+"' username='"+username+"'><span class='image'><span></span></span><span class='username'>"+username+"</span></div>";
}

function GET(url, callback, shouldParse) {
	if (typeof shouldParse === 'undefined')
		shouldParse = true;
	let xhr = new XMLHttpRequest();
	if (url.indexOf('http://')!=0 && url.indexOf('https://')!=0 && url[0] != '/')
		url = 'http://'+url;
	xhr.open('GET', url, true);
	xhr.send();
	xhr.onreadystatechange = function () {
		if (xhr.readyState !== 4) return;

		if (xhr.status == 200) {
			let data = xhr.responseText;
			if (shouldParse) {
				try {
					data = JSON.parse(data);
				} catch (e) {}
			}
			callback(true, data);
		} else {
			callback(false, xhr);
		}
	}
}
function POST(url, before, callback) {
	let xhr = new XMLHttpRequest();
	if (url.indexOf('http://')!=0&&url.indexOf('https://')!=0)
		url = 'http://'+url;
	xhr.open('POST', url, true);
	before(xhr);
	xhr.onreadystatechange = function () {
		if (xhr.readyState !== 4) return;

		if (xhr.status == 200) {
			let data = xhr.responseText;
			try {
				data = JSON.parse(data);
			} catch (e) {}
			callback(true, data);
		} else {
			callback(false, xhr);
		}

	}
}

function B(x) {
	let type, buff;
	if (x instanceof ArrayBuffer) {
		type = 3;
		buff = x;
	} else if (typeof x === 'string') {
		type = 0;
		buff = str2ab(x);
	} else if (typeof x === 'object') {
		type = 1;
		buff = str2ab(JSON.stringify(x));
	} else if (typeof x === 'number') {
		type = 2;
		buff = Int16(x);
	}
	return concat(Uint8(type), buff);
}
function ab2str(buf) {
	return String.fromCharCode.apply(null, new Uint8Array(buf));
}
function str2ab(str) {
	var buf = new ArrayBuffer(str.length);
	var bufView = new Uint8Array(buf);
	for (var i=0, strLen=str.length; i<strLen; i++) {
		bufView[i] = str.charCodeAt(i);
	}
	return buf;
}
function concat() {
	let buffers = arr(arguments);
	let n = 0;
	for (let i = 0; i < buffers.length; ++i)
		n += buffers[i].byteLength;
	let buff = new Uint8Array(n);
	for (let i = 0, j = 0; i < buffers.length; ++i) {
		buff.set(new Uint8Array(buffers[i]), j);
		j += buffers[i].byteLength;
	}
	return buff;
}
function Uint8(x) {
	let b = new Uint8Array(1);
	b[0] = x;
	return b.buffer;
}
function Uint16(x) {
	let b = new Uint16Array(1);
	b[0] = x;
	return b.buffer;
}
function Int16(x) {
	let b = new Int16Array(1);
	b[0] = x;
	return b.buffer;
}