Object.getOwnPropertyNames(Math).forEach(k => window[k] = Math[k]);
function arr(args) {
	return Array.prototype.slice.apply(args);
}

let workspace = document.querySelector('#workspace');
let game = document.querySelector('#game');

let canvasContainer = game.querySelector('#canvas-container');
let canvas = window.canvas = canvasContainer.querySelector('canvas');
let ctx = window.ctx = canvas.getContext('2d');

let controlsContainer = workspace.querySelector('#controls');

class Bodjo extends EventEmitter {
	constructor() {
		super();
		this.__renderArguments = [];
		this.__controls = null;
		this.storage = {
			load: function (name) {
				if (localStorage.getItem(name))
					return JSON.parse(localStorage.getItem(name));
				if (getCookie(name))
					return JSON.parse(getCookie(name));
				return null;
			},
			save: function (name, value) {
				localStorage.setItem(name, JSON.stringify(value));
				setCookie(name, JSON.stringify(value));
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

	showError(err) {
		console.error(err);
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
let tabs = tabsContainer.querySelectorAll(".tab");
let pages = Array.from(tabs, function (tab) {
	return container.querySelector("#" + tab.id.substring(0, tab.id.length-4) + "-page");
});
tabs.forEach(function (tab) {
	let pagename = tab.id.substring(0, tab.id.length-4);
	tab.addEventListener('mouseup', makeActive.bind(null, pagename));
});
function makeActive(pagename) {
	bodjo.storage.save('active-tab', pagename);
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
}
makeActive(bodjo.storage.load('active-tab') || 'docs');

// code
let codeWrapper = workspace.querySelector("#code-wrapper");
let codeContainer = codeWrapper.querySelector('#code');
bodjo.editor = ace.edit(codeContainer, {
	mode: 'ace/mode/javascript'
});
bodjo.editor.setFontSize(bodjo.storage.load('code-font-size') || 20);
codeContainer.addEventListener('keydown', function (e) {
	if ((e.keyCode == 187 || e.keyCode == 189) && (e.metaKey || e.altKey)) {
		e.stopPropagation();
		let newFontSize = range(editor.getFontSize() + 2*(e.keyCode==187?1:-1), 10, 50);
		bodjo.editor.setFontSize(newFontSize);
		bodjo.storage.save('code-font-size', newFontSize);
		return false;
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
function onMouseDown() {
	resizing = true;
	clearSelection();
}
function onMouseUp() {
	resizing = false;
}
function onMouseMove(e) {
	if (!resizing) return;
	
	let x = range(e.clientX, 150, window.innerWidth - 150);
	workspace.style.width = x + 'px';
	game.style.left = x + 'px';
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
	let credentials = getCredentials();
	socket = connect(credentials);
});

function getCredentials() {
	let credentials = {};
	credentials.role = window.location.pathname.indexOf('spectate') >= 0 ? 'spectator' : 'player';
	if (credentials.role === 'spectate') {
		// TODO: retrieving username from pathname
	} else {
		if (DEV) {
			credentials.username = prompt('Username: ');
			credentials.token = Math.round(Math.random()*9999999+99999) + '';
		} else {
			// TODO: retrieving token from main server
			credentials.username = localStorage.USERNAME;
		}
	}

	return credentials;
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
				case 2: // player has already connected (role=player)
					console.error('[socket] player has already connected', errobj);
					break;
				case 4: // gameSessionToken is invalid
					console.error('[socket] bad gameSessionToken', errobj);
					break;
				default:
					console.error('[socket] unknown error', errobj);
			}
		}
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