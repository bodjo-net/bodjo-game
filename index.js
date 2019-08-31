require('colors');
const fs = require('fs');
const http = require('http');
const https = require('https');
const socketio = require('socket.io');
const net = require('net');
const mime = require('mime');
// const crypto = require('crypto');
const EventEmitter = require('events');

require('./logger.js');
require('./utils.js');

console.log(`  __                    __       ${"__".cyan.bold}\n /\\ \\                  /\\ \\     ${"/\\_\\".cyan.bold}\n \\ \\ \\____   ______   _\\_\\ \\    ${"\\/_/".cyan.bold}_   ______\n  \\ \\  __ \\ /\\  __ \\ /\\  __ \\   __/\\ \\ /\\  __ \\\n   \\ \\ \\_\\ \\\\ \\ \\_\\ \\\\ \\ \\_\\ \\ /\\ \\_\\ \\\\ \\ \\_\\ \\\n    \\ \\_____\\\\ \\_____\\\\ \\_____\\\\ \\_____\\\\ \\_____\\\n     \\/_____/ \\/_____/ \\/_____/ \\/_____/ \\/_____/\n`);
class BodjoGame extends EventEmitter {
	constructor(config) {
		super();
		this.__jsFilesDir = null;
		this.__serverURL = null;
		this.config = config;

		this._io = null;

		this.__availableIDs = Array.from({length: 255}, (x, i) => i);
		this.__playersIDs = {};
		this.__players = {};
		this.__spectators = [];
		this.__gameSessionTokens = {};
		
		this.scoreboard = new Scoreboard(this);
	}

	initClient(dir) {
		if (dir[dir.length-1] == '/')
			dir = dir.substring(0, dir.length-1);
		if (!fs.existsSync(dir)) {
			warn('.initClient(): ' + dir.cyan.bold + ' directory doesn\'t exist');
			return;
		}

		if (!fs.existsSync(dir + '/main.js') ||
			!fs.existsSync(dir + '/renderer.js')) {
			warn('.initClient(): ' + dir.cyan.bold + ' directory should contain ' + 'main.js'.cyan.bold + ' and ' + 'renderer.js'.cyan.bold + ' files.');
			return;
		}

		this.__jsFilesDir = dir;
	}
	broadcast() {
		if (this._io) {
			this._io.emit.apply(this._io, Array.prototype.slice.apply(arguments));
		}
	}
	async start() {
		let bodjo = this;
		if (this.config instanceof Promise)
			this.config = await this.config;

		if (this.__jsFilesDir == null) {
			err('.start(): You should execute .initClient() first. Make sure it has set up client directory correctly.');
			return;
		}

		this.__serverURL = await GET("https://bodjo.net/SERVER_HOST");
		log('Got main server IP: ' + this.__serverURL.bold);

		const webdir = __dirname + '/web';
		let cache = {};
		function onHTTPRequest(req, res) {
			let uri = req.url;
			let url = uri;
			if (url.indexOf('?') >= 0)
				url = url.substring(0, url.indexOf('?'));

			if (url == '/')
				url = '/index.html';
			else if (url == '/spectate' || url == '/spectate/')
				url = '/spectate/index.html';
			else if (url == '/admin' || url == '/admin/')
				url = '/admin/index.html';

			let dirs = url.split('/');
			if (dirs.indexOf('..') >= 0) {
				res.statusCode = 400;
				res.end();
				return;
			}
			let origin = req.headers['origin'];
			if (origin && ['http://bodjo:3000','http://bodjo.net','https://bodjo.net','http://localhost:3000','http://localhost','http://bodjo','http://77.120.70.136'].includes(origin))
				res.setHeader('Access-Control-Allow-Origin', origin);

			if (url === '/status') {
				res.writeHead(200, {'Content-Type': 'application/json'});
				res.write(JSON.stringify({
					playersCount: keys(bodjo.__players).length,
					maxPlayersCount: bodjo.config.maxPlayers
				}));
				res.end();
				return;
			}
			if (url === '/ping') {
				res.writeHead(200, {'Content-Type': 'plain/text'});
				res.write(Date.now().toString());
				res.end();
				return;
			}

			let path = null;
			if (fs.existsSync(bodjo.__jsFilesDir + url)) {
				path = bodjo.__jsFilesDir + url;
			} else if (fs.existsSync(webdir + url)) {
				path = webdir + url;
			} else {
				res.statusCode = 404;
				res.end();
				return;
			}

			let contentType = mime.getType(url);
			res.statusCode = 200;
			if (contentType)
				res.setHeader('Content-Type', contentType);

			if (url == '/engine.js' ||
				url == '/spectate/engine.js') {
				res.write('window.DEV = ' + (process.argv.includes('--dev') ? 'true' : 'false') + ';\n');
				res.write('window.GAME_NAME = \'' + bodjo.config.game + '\';\n');
				res.write('window.GAME_SERVER = \'' + bodjo.config.name + '\';\n');
			}

			if (!process.argv.includes('--dev')) {
				if (typeof cache[url] === 'undefined')
					cache[url] = fs.readFileSync(path);
				res.write(cache[url]);
				res.end();
			} else {
				let stream = fs.createReadStream(path);
				stream.on('open', () => stream.pipe(res));
				stream.on('error', () => res.end());
			}
		}
		let httpServer = http.createServer(onHTTPRequest),
			httpsServer = null;
		if (this.config.ssl) {
			if (!containsKeys(this.config.ssl, ['key', 'cert'])) {
				warn(`.start(): SSL options in config file should contain two keys: ${`"key"`.white.bold}, ${`"cert"`.white.bold}.`);
			} else {
				let key = fs.readFileSync(this.config.ssl.key);
				let cert = fs.readFileSync(this.config.ssl.cert);

				httpsServer = https.createServer({key, cert}, onHTTPRequest);
				log("[HTTP] SSL credentials obtained.");
			}
		}

		bodjo._io = socketio(httpServer);
		bodjo._io.use((socket, next) => {
			let query = socket.handshake.query;

			if (keys(bodjo.__players).length >= bodjo.config.maxPlayers) {
				return next(wsErrObj('max players', 6));
			}

			if (typeof query.role !== 'string') {
				return next(wsErrObj('"role" should be passed in query', 0));
			}

			if (query.role === 'spectator') {
				bodjo.__spectators.push(socket);
			} else if (query.role === 'player') {
				if (typeof query.username !== 'string')
					return next(wsErrObj('"username" should be passed in query', 0));
				if (typeof query.token !== 'string')
					return next(wsErrObj('gameSessionToken in query is not found (key "token")', 3));

				if (!process.argv.includes('--dev') &&
					(!bodjo.__gameSessionTokens[query.username] ||
					 !bodjo.__gameSessionTokens[query.username].includes(query.token))) {
					return next(wsErrObj('gameSessionToken is invalid', 4));
				}

				if (bodjo.__players[query.username]) {
					bodjo.__players[query.username].socket.emit('new-tab');
					bodjo.__players[query.username].socket.disconnect(true);
					delete bodjo.__players[query.username];
					// return next(wsErrObj('player has already connected', 2));
				}
			} else {
				return next(wsErrObj('role should be "spectator" or "player"', 5));
			}
			return next();
		});
		bodjo._io.on('connection', socket => {
			let query = socket.handshake.query;
			let role = query.role;
			let username = query.username;

			let player, id;
			if (role === 'player') {
				if (typeof bodjo.__playersIDs[username] === 'undefined') {
					bodjo.__playersIDs[username] = bodjo.__availableIDs[0];
					bodjo.__availableIDs.splice(0, 1);
				}
				id = bodjo.__playersIDs[username];
				player = new Player(socket, username, id, bodjo);
				bodjo.__players[username] = player;
				bodjo.emit('player-connect', player);
			}

			socket.emit('_scoreboard', bodjo.scoreboard.raw());

			socket.on('disconnect', () => {
				if (username != null && player && bodjo.__players[username]) {
					// player.socket.close();
					delete bodjo.__players[username];
				}

				if (username != null && bodjo.__playersIDs[username]) {
					bodjo.__availableIDs.push(bodjo.__playersIDs[username]);
					delete bodjo.__playersIDs[username];
				}
			})
		});
		bodjo.scoreboard.onUpdate = function () {
			bodjo._io.emit('_scoreboard', bodjo.scoreboard.raw());
		}
		httpServer.listen(this.config.httpPort, this.config.httpHost || '0.0.0.0', function (error) {
			if (error)
				fatalerr(error);
			else log('[HTTP] HTTP Server is listening at ' + (':'+bodjo.config.httpPort).yellow.bold);
		});
		if (httpsServer) {
			httpsServer.listen(this.config.httpsPort, this.config.httpsHost || this.config.httpHost || '0.0.0.0', function (error) {
				if (error)
					err(error);
				else log('[HTTP] HTTPS (API) Server is listening at ' + (':'+bodjo.config.httpsPort).yellow.bold);
			})
		}

		if (!process.argv.includes('--dev')) {
			// let tcpServer = net.createServer((socket) => {
			// 	let authorized = false;
			// 	socket.on('data', function (message) {
			// 		if (message instanceof Buffer)
			// 			message = message.toString();
			// 		if (typeof message !== 'string')
			// 			return;

			// 		let object = null;
			// 		try {
			// 			object = JSON.parse(message);
			// 		} catch (e) { return; }

			// 		if (typeof object !== 'object' ||
			// 			Array.isArray(object) || object == null)
			// 			return;

			// 		if (object.type === 'connect') {
			// 			if (object.name === bodjo.config.name &&
			// 				object.secret === bodjo.config.secret) {
			// 				socket.write(JSON.stringify({type:'connect',status:'ok'}));
			// 				authorized = true;
			// 				log("[TCP] Main server connected successfully.");
			// 			} else {
			// 				socket.write(JSON.stringify({type:'connect',status:'fail'}));
			// 			}
			// 		} else if (object.type === 'new-player') {
			// 			if (!authorized)
			// 				return;

			// 			if (typeof object.username !== 'string' ||
			// 				typeof object.token !== 'string')
			// 				return;

			// 			if (!bodjo.__gameSessionTokens[object.username])
			// 				bodjo.__gameSessionTokens[object.username] = [];

			// 			bodjo.__gameSessionTokens[object.username].push(object.token);
			// 			log("[TCP] Received " + object.username.cyan + "'s gameSessionToken ("+object.token.grey+")");
			// 		}
			// 	});
			// 	socket.on('error', function (error) {
			// 		if (authorized)
			// 			warn("[TCP] Main server connection error.", error);
			// 	})
			// 	socket.on('disconnect', function () {
			// 		if (authorized)
			// 			log("[TCP] Main server disconnected.");
			// 	});
			// 	socket.on('close', function () {
			// 		if (authorized)
			// 			log("[TCP] Main server disconnected.");
			// 	});
			// });
			// tcpServer.listen(this.config.tcpPort, this.config.tcpHost || '0.0.0.0');

			let hostname = bodjo.__serverURL;
			hostname = hostname.replace(/https{0,1}\:\/\/|\:\d+|\n/g, '');

			let tcpClient = null;
			function connectTCP() {
				let interval = null;
				let authorized = false;
				log("[TCP] Trying to connect to main server... (" + (hostname + ":3221").grey+")");
				tcpClient = net.connect(3221, hostname, function () {
					log("[TCP] Connected to main server.");
					tcpClient.write(JSON.stringify({
						type: 'connect',
						name: bodjo.config.name,
						secret: bodjo.config.secret
					}));
					interval = setInterval(function () {
						tcpClient.write('ping');
					}, 10000);
				});
				tcpClient.on('data', function (message) {
					if (message instanceof Buffer)
						message = message.toString();
					if (typeof message !== 'string')
						return;

					if (message == 'pong')
						return;

					let object = null;
					try {
						object = JSON.parse(message);
					} catch (e) { return; }

					if (object.type === 'connect') {
						if (object.status === 'ok') {
							authorized = true;
							log("[TCP] Authorized", 'successfully'.green.bold + ".");
						} else {
							warn("[TCP] " + 'Failed'.red.bold + " to authorize.");
						}
					} else if (object.type === 'new-player' && authorized) {
						if (typeof object.username !== 'string' ||
							typeof object.token !== 'string')
							return;

						if (!bodjo.__gameSessionTokens[object.username])
							bodjo.__gameSessionTokens[object.username] = [];

						bodjo.__gameSessionTokens[object.username].push(object.token);

						log("[TCP] Received " + object.username.cyan.bold + "'s gameSessionToken (" + object.token.grey + ")");
					}
				});
				tcpClient.on('error', function (error) {
					warn("[TCP] Error.", error);
				});
				tcpClient.on('close', function () {
					log("[TCP] Disconnected. Trying to connect again...");
					if (interval != null)
						clearInterval(interval);
					setTimeout(connectTCP, 2500);
				});
			}
			connectTCP();
		}
	}
	async addBots(script, number) {
		let config = this.config;
		if (config instanceof Promise)
			config = await config;
		this.__bots = [];
		for (let i = 1; i <= number; ++i) {
			let username = 'bot' + i;
			let token = ~~(Math.random()*999999999+99999) + '';
			this.__gameSessionTokens[username] = [token];
			let botscript = require(script)(config.httpPort, username, token);
			console.log('Bot ' + username.yellow.bold + ' started.' + (' ('+token+')').grey);
			this.__bots.push(username);
		}
	}
}
class Player {
	constructor(socket, username, id, bodjo) {
		this.socket = socket;
		this.username = username;
		this.id = id;
		this.knownIds = [];
		this.spectators = [];
		this.bodjo = bodjo;
	}

	addSpectator(socket) {
		this.spectators.push(socket);
	}

	emit() {
		let data = arr(arguments);
		this.socket.emit.apply(this.socket, data);
		// for (let spectator of this.spectators) {
		// 	//if (alive)
		// 	spectator.emit.apply(this.socket, data);
		// }
		data.splice(1, 0, this.username);
		this.bodjo.__spectators.forEach(spectator => {
			spectator.emit.apply(spectator, data);
		});
	}

	on() {
		this.socket.on.apply(this.socket, arr(arguments));
	}

	once() {
		this.socket.once.apply(this.socket, arr(arguments));
	}
}
class Scoreboard {
	constructor(bodjo, filename = "scoreboard.json") {
		this.onUpdate = null;
		this.updateWhenNeeded = true;
		this.wasUpdates = false;
		this.sortFunction = function (a, b) {
			if (typeof a.value === 'undefined') {
				warn('[scoreboard] write ' + 'bodjo.scoreboard.sortFunction' + ' for sort.');
				return 0;
			}
			return b.value - a.value;
		}
		this.bodjo = bodjo;

		try {
			this.data = JSON.parse(fs.readFileSync('scoreboard.json').toString());
		} catch (e) {
			this.data = {};
			this.save();
			warn('[scoreboard] file not found ('+'scoreboard.json'.magenta.bold+'), creating new');
		}
	}

	push(username, value) {
		if (username instanceof Player)
			username = username.username;
		if (/^bot\d+$/g.test(username))
			return;

		this.data[username] = value;
		if (this.updateWhenNeeded)
			this.onUpdate();
		else
			this.wasUpdates = true;
		this.save();
	}

	update() {
		// console.dir(this.data)
		if (this.wasUpdates) {
			this.wasUpdates = false;
			this.onUpdate();
		}
	}

	save() {
		fs.writeFileSync('scoreboard.json', JSON.stringify(this.data));
	}

	getID(username) {
		return this.bodjo.__playersIDs[username];
	}

	raw() {
		let rawdata = Array.from(Object.keys(this.data), username => {
			if (typeof this.data[username] === 'object' &&
				this.data[username] != null &&
				!Array.isArray(this.data[username]))
				return Object.assign({username, id: this.getID(username)}, this.data[username]);
			return {username, id: this.getID(username), value: this.data[username]};
		}).sort(this.sortFunction);
		for (let i = 0, place = 1; i < rawdata.length; ++i) {
			rawdata[i].place = place;
			if (i+1 < rawdata.length)
				if (this.sortFunction(rawdata[i+1], rawdata[i]) > 0)
					place++;
		}
		if (this.bodjo.__bots)
			for (let botname of this.bodjo.__bots)
				if (typeof this.getID(botname) === 'number')
					rawdata.push({username: botname, id: this.getID(botname)});
		return rawdata;
	}

	get(username) {
		if (username instanceof Player)
			username = username.username;
		if (/^bot\d+$/g.test(username))
			return undefined;
		return this.data[username];
	}

	clear() {
		log('[scoreboard] scoreaboard cleared');
		this.data = {};
		this.save();
	}
}
module.exports = BodjoGame;