Object.getOwnPropertyNames(Math).forEach(k => window[k] = Math[k]);
function arr(args) {
	return Array.prototype.slice.apply(args);
}

document.querySelector('title').innerHTML = GAME_NAME + " (" + GAME_SERVER + ")";

let canvasesContainer = document.querySelector('#canvases-container');
let workspace = document.querySelector('#workspace');
let game = document.querySelector('#game');
let scoreboard = document.querySelector('#scoreboard-page');
let noplayers = document.querySelector('#no-players');


const domain = getDomain();
class Bodjo extends EventEmitter {
	constructor() {
		super();
		this.ids = {};
		this.canvases = {};
		this.contextName = '2d';
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

	callRender(username) {
		if (arguments.length == 0) {
			this.resizeCanvases();
			return;
		}

		let args = arr(arguments);
		if (typeof args[0] !== 'string')
			username = '';
		else args.splice(0, 1);

		if (typeof this.canvases[username] === 'undefined') {
			let player = document.createElement('div');
			if (username.length > 0) {
				player.innerHTML += Player(username);
			}
			let newCanvas = document.createElement('canvas');
			this.canvases[username] = {
				element: player,
				canvas: newCanvas,
				ctx: newCanvas.getContext(this.contextName),
				args: args,
				aspectRatio: 1
			};
			player.appendChild(newCanvas);
			canvasesContainer.appendChild(player);
			this.resizeCanvases();
		}

		let canvas = this.canvases[username];
		canvas.args = args;
		this.render.apply(this, [canvas.canvas, canvas.ctx, (newAspectRatio) => {
					let wasAspectRatio = canvas.aspectRatio;
					canvas.aspectRatio = newAspectRatio;
					if (newAspectRatio != wasAspectRatio)
						this.resizeCanvases();
				}].concat(canvas.args))
	}

	remove(username) {
		this.canvases[username].element.remove();
		delete this.canvases[username];
		this.resizeCanvases();
	}


	resizeCanvases() {
		let width = game.clientWidth - 40, height = game.clientHeight - 40;
		let usernames = Object.keys(this.canvases);
		let n = usernames.length;
		let rowsCount = Math.max(1, Math.round(width / height)) * 2;
		let N = n < rowsCount ? n : rowsCount;

		let cwidth = Math.min((width) / N - 20, height - 60);

		for (let i = 0; i < usernames.length; ++i) {
			let canvas = this.canvases[usernames[i]];
			canvas.canvas.width = cwidth * window.devicePixelRatio;
			canvas.canvas.height = (cwidth / canvas.aspectRatio) * window.devicePixelRatio;
			canvas.canvas.style.width = cwidth + 'px';
			canvas.canvas.style.height = (cwidth / canvas.aspectRatio) + 'px';
			if (this.render) {
				this.render.apply(this, [canvas.canvas, canvas.ctx, (newAspectRatio) => {
					let wasAspectRatio = canvas.aspectRatio;
					canvas.aspectRatio = newAspectRatio;
					if (newAspectRatio != wasAspectRatio)
						this.resizeCanvases();
				}].concat(canvas.args));
			}
		}

		noplayers.style.display = (usernames.length == 0 ? 'block' : 'none')
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
}

window.bodjo = new Bodjo();


let socket;
window.addEventListener('load', function () {
	GET('https://bodjo.net/SERVER_HOST', (status, hostname) => {
		if (status)
			SERVER_HOST = hostname;
		connect();
		bodjo.callRender();
	});
});
function connect() {
	let path = window.location.protocol+'//'+window.location.host+'?role=spectator';
	socket = io(path);
	socket.on('error', console.error);

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
	socket.on('_scoreboard', (scoreboard) => {
		scoreboard.forEach(player => bodjo.ids[player.id] = player.username);
		bodjo.emit('scoreboard', scoreboard.filter(player => !/^bot/g.test(player.username)));
	});
	
	let oldEmit = socket.emit;
	socket.emit = function () {
		bodjo.emit.apply(bodjo, arr(arguments).concat([socket]));
		oldEmit.apply(socket, arr(arguments));
	}
}


let interval = null;
function resizeUI() {
	container.style.top = bar.clientHeight + "px";
	bodjo.resizeCanvases();
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
	bodjo.resizeCanvases();
	bodjo.callRender();
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
function getDomain() {
	return (window.location.hostname.match(/\./g)||[]).length > 1 ? window.location.hostname.substring(window.location.hostname.indexOf('.')+1) : window.location.hostname;
}

let playersData = {};
let playersToLoad = {};
let lastPlayerAdded = -1;
function Player(username) {
	if (typeof playersData[username] !== 'undefined') {
		if (playersData[username] == null)
			return "<div class='bodjo-player'><span class='image'></span><span class='username'>"+username+"</span></div>";
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
						let userinfo = data.result[usernames[i]];
						playersData[usernames[i]] = userinfo;

						if (userinfo != null) {
							let playerElement = document.querySelector('#'+playersToLoad[usernames[i]]);
							playerElement.querySelector('span.image').style.backgroundImage = "url('"+data.result[usernames[i]].image[64]+"')";
							playerElement.className = 'bodjo-player';
							delete playersToLoad[usernames[i]];
						}
					}
				}
			})
		}
	}, 100);

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
