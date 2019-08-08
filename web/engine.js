Object.getOwnPropertyNames(Math).forEach(k => window[k] = Math[k]);
function arr(args) {
	return Array.prototype.slice.apply(args);
}

document.querySelector('title').innerHTML = 'bodjo-' + GAME_NAME + " (" + GAME_SERVER + ")";

let loaded = false;

let workspace = document.querySelector('#workspace');
let game = document.querySelector('#game');
let scoreboard = document.querySelector('#scoreboard-page');

let canvasContainer = game.querySelector('#canvas-container');
let canvas = window.canvas = canvasContainer.querySelector('canvas');
let ctx = window.ctx = canvas.getContext('2d');

let errorsContainer = workspace.querySelector('#errors');
let controlsContainer = workspace.querySelector('#controls');

class Bodjo extends EventEmitter {
	constructor() {
		super();
		this.__renderArguments = [];
		this.__controls = null;
		this.storage = {
			get: function (name) {
				if (localStorage.getItem(name))
					return JSON.parse(localStorage.getItem(name));
				if (getCookie(name))
					return JSON.parse(getCookie(name));
				return null;
			},
			set: function (name, value) {
				localStorage.setItem(name, JSON.stringify(value));
				setCookie(name, JSON.stringify(value), {domain: 'bodjo.net'});
			}
		}
	}
	render() {
		let args = arr(arguments);
		if (args.length > 0)
			this.__renderArguments = args;
		this.emit.apply(bodjo, ['render'].concat(this.__renderArguments));
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
		for (let i = 0; i < this.__controls.length; ++i) {
			if (this.__controls[i].name == name)
				return this.__controls[i];
		}
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
			for (let j = 0; j < data[i].length; ++j)
				html += '<td>' + data[i][j] + '</td>';
			html += '</tr>';
		}

		scoreboard.innerHTML = html;
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

function resizeCanvas(aspectRatio) {
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
resizeCanvas();
window.addEventListener('resize', function () {
	resizeCanvas();
	bodjo.render();
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
	resizeCanvas();
	bodjo.render();
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

let socket;
window.addEventListener('load', function () {
	GET('https://bodjo.net/SERVER_HOST', (status, hostname) => {
		if (status)
			SERVER_HOST = hostname;
		getCredentials(credentials => socket = connect(credentials));
		loaded = true;
		loadCode();
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
}

function saveCode(uploadToMainServer) {
	if (typeof uploadToMainServer === 'undefined')
		uploadToMainServer = true;

	if (!codeChanged)
		return;

	changeCodeChange(false)
	bodjo.storage.set('bodjo-code-time-'+GAME_NAME, Date.now());
	bodjo.storage.set('bodjo-code-selection-'+GAME_NAME, bodjo.editor.selection.toJSON());
	localStorage.setItem('bodjo-code-'+GAME_NAME, JSON.stringify(bodjo.editor.getValue()));

	if (uploadToMainServer) {
		POST(SERVER_HOST + '/code/save?game=' + GAME_NAME + '&token=' + TOKEN, req => {
			req.setRequestHeader("Content-Type", "plain/text");
			req.send(bodjo.editor.getValue());
		}, (status, data) => {
			if (status && data.status == 'ok') {
				console.log('code saved. (uploaded to main server)');

				bodjo.showNotification('Code saved. (Uploaded to server)', 2500);
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
	let localCodeTime = bodjo.storage.get('bodjo-code-time-'+GAME_NAME);
	let localCode = JSON.parse(localStorage.getItem('bodjo-code-'+GAME_NAME));
	let selection = bodjo.storage.get('bodjo-code-selection-'+GAME_NAME);
	GET(SERVER_HOST + '/code/date?game=' + GAME_NAME + '&token=' + TOKEN, (status, data) => {
		if (status) {
			let serverCodeTime = data.result || 0;
			if (data.status !== 'ok') {
				if (typeof localCodeTime === 'number' &&
					typeof localCode === 'string') {
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
					Math.round(localCodeTime / 1000) >= Math.round(serverCodeTime / 1000)) {

					bodjo.editor.setValue(localCode, 1);
					if (selection)
						bodjo.editor.selection.fromJSON(selection);
					changeCodeChange(false);
					saveCode(false);
					console.log('code loaded from localStorage');

				} else {
					GET(SERVER_HOST + '/code/load?game=' + GAME_NAME + '&token=' + TOKEN, (status, data) => {
						if (status && data.status === 'ok') {
							bodjo.storage.set('bodjo-code-time', data.date);
							localStorage.setItem('bodjo-code-'+GAME_NAME, JSON.stringify(data.content));

							bodjo.editor.setValue(data.content, 1);
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

function getCredentials(cb) {
	let credentials = {};
	credentials.role = window.location.pathname.indexOf('spectate') >= 0 ? 'spectator' : 'player';
	if (credentials.role === 'spectate') {
		// TODO: retrieving username from pathname
	} else {
		if (DEV) {
			credentials.username = prompt('Username: ');
			credentials.token = Math.round(Math.random()*9999999+99999) + '';
			cb(credentials);
		} else {
			let gameToken = bodjo.storage.get('bodjo-game-token-'+GAME_SERVER);
			let username = bodjo.storage.get('bodjo-username');
			if (gameToken && username) {
				credentials.username = username;
				credentials.token = gameToken;
				credentials.probable = true;
				cb(credentials);
				return;
			}

			TOKEN = bodjo.storage.get('bodjo-token');
			if (!TOKEN) {
				console.error("token in cookie and localStorage wasn't found.");
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
				cb(credentials);
			});
		}
	}

}
function connect(credentials) {
	let path = window.location.protocol+'//'+window.location.host+'?'+
		Object.keys(credentials).map(k => k + '=' + encodeURIComponent(credentials[k])).join('&');
	console.log('connecting to ' + path);
	let socket = io(path);
	socket.on('error', function (err) {
		let errobj;
		try {
			errobj = JSON.parse(err);
		} catch (errp) {
			console.error(err);
			return;
		}

		if (errobj.status == 'err') {
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
					console.error('[socket] max players');
					break;
				default:
					console.error('[socket] unknown error', errobj);
			}
		}
	});
	let closeSocketEvent = function () {
		console.log('beforeunload => socket close')
		socket.close();
	}
	socket.on('connect', () => {
		window.addEventListener("beforeunload", closeSocketEvent, false);
	});
	socket.on('disconnect', () => {
		window.removeEventListener("beforeunload", closeSocketEvent, false);
	});

	socket.on('new-tab', () => {
		bodjo.showDialog('new-tab-dialog');
	});

	let oldEmit = socket.emit;
	socket.emit = function () {
		bodjo.emit.apply(bodjo, arr(arguments).concat([socket]));
		oldEmit.apply(socket, arr(arguments));
	}
	return socket;
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

let playersData = {};
let playersToLoad = {};
let lastPlayerAdded = -1;
function Player(username) {
	if (playersData[username]) {
		return "<div class='bodjo-player'><span class='image' style=\"background-image:url('"+playersData[username].image[64]+"');\"></span><span class='username'>"+username+"</span></div>";
	}

	let id = 'p' + ~~(Math.random() * 999999 + 999999);
	let wasLastPlayerAdded = lastPlayerAdded = Date.now();
	playersToLoad[username] = id;
	setTimeout(function () {
		if (wasLastPlayerAdded == lastPlayerAdded && Object.keys(playersToLoad).length > 0) {
			// load [playersToLoad]
			GET(SERVER_HOST+'/account/info?usernames=' + Object.keys(playersToLoad).join(','), (status, data) => {
				if (status && data.status === 'ok') {
					let usernames = Object.keys(data.result)
					for (let i = 0; i < usernames.length; ++i) {
						let playerElement = document.querySelector('#'+playersToLoad[usernames[i]]);
						playerElement.querySelector('span.image').style.backgroundImage = "url('"+data.result[usernames[i]].image[64]+"')";
						playerElement.className = 'bodjo-player';
					}
					playersToLoad = {};
				}
			})
		}
	}, 50);

	return "<div class='bodjo-player loading' id='"+id+"'><span class='image'></span><span class='username'>"+username+"</span></div>";
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
