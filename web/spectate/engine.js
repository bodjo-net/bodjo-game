Loading.header(GAME_SERVER, 'v' + LIB_VERSION);
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
const webrtcOptions = {
	iceServers: [
		// {urls:['stun:localhost:3478']}
		{urls:['stun:stun.l.google.com:19302']}//,
		// {urls:['stun:stun1.l.google.com:19302']},
		// {urls:['stun:stun2.l.google.com:19302']},
		// {urls:['stun:stun3.l.google.com:19302']},
		// {urls:['stun:stun4.l.google.com:19302']}
	]
};

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
				}, true].concat(canvas.args))
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

		let cwidth = Math.min((width) / N - 20, height - (usernames.length==1&&usernames[0].length==0 ? 25 : 60));

		for (let i = 0; i < usernames.length; ++i) {
			let canvas = this.canvases[usernames[i]];
			canvas.canvas.width = cwidth * window.devicePixelRatio;
			canvas.canvas.height = (cwidth / canvas.aspectRatio) * window.devicePixelRatio;
			canvas.canvas.style.width = cwidth + 'px';
			canvas.canvas.style.height = (cwidth / canvas.aspectRatio) + 'px';
			if (this.render) {
				this.render.apply(this, [canvas.canvas, canvas.ctx, (newAspectRatio) => {
					if (isNaN(newAspectRatio))
						return;
					let wasAspectRatio = canvas.aspectRatio;
					canvas.aspectRatio = newAspectRatio;
					if (newAspectRatio != wasAspectRatio)
						this.resizeCanvases();
				}, false].concat(canvas.args));
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

		setTimeout(updateOnline, 10);
	}
}

window.bodjo = new Bodjo();

let langs = ['en', 'ru'], loadings = [];
bodjo.lang = bodjo.storage.get('bodjo-lang') || 'en';
if (langs.indexOf(bodjo.lang) < 0)
	bodjo.lang = langs[0];
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

let socket, psocket;
window.addEventListener('load', function () {
	GET('https://bodjo.net/SERVER_HOST', (status, hostname) => {
		if (status)
			SERVER_HOST = hostname;
		connect();
		bodjo.callRender();
	});
});
let closing = false;
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
		closing = true;
		window.removeEventListener("beforeunload", closeSocketEvent, false);
	});
	socket.on('_scoreboard', (scoreboard) => {
		scoreboard.forEach(player => bodjo.ids[player.id] = player.username);
		bodjo.emit('scoreboard', scoreboard.filter(player => !/^bot/g.test(player.username)));
	});


	Loading.put(loadings[0]);
	socket.on('connect', () => {
		Loading.put(loadings[1]);
		
		var onevent = socket.onevent;
		socket.onevent = function (packet) {
		    var args = packet.data || [];
		    onevent.call (this, packet);
		    packet.data = ["*"].concat(args);
		    onevent.call(this, packet);
		};

		peer = new RTCPeerConnection(webrtcOptions);
		peer.ondatachannel = (event) => {
			channel = event.channel;
			Loading.put(loadings[4]);
			channel.onopen = () => {
				Loading.put(loadings[5]);
				Loading.hide();
				psocket = new PseudoSocket(socket, peer, channel)
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
	let bufferedMessages = [];
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
	});

	
	// let oldEmit = socket.emit;
	// socket.emit = function () {
	// 	bodjo.emit.apply(bodjo, arr(arguments).concat([socket]));
	// 	oldEmit.apply(socket, arr(arguments));
	// }
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
	// bodjo.callRender();
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
let lastRequest = 0;
function Player(username) {
	if (typeof playersData[username] !== 'undefined') {
		if (playersData[username] == null)
			return "<div class='bodjo-player'><span class='image'></span><span class='username'>"+username+"</span></div>";
		return "<div class='bodjo-player'><span class='image' style=\"background-image:url('"+playersData[username].image[64]+"');\"></span><span class='username'>"+username+"</span></div>";
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

	return "<div class='bodjo-player loading' id='"+id+"'><span class='image'></span><span class='username'>"+username+"</span></div>";
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