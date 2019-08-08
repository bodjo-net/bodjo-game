require('colors');
const fs = require('fs');
const http = require('http');
const socketio = require('socket.io');
const net = require('net');
const mime = require('mime');
const crypto = require('crypto');
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

		this.__players = {};
		this.__gameSessionTokens = {};

		this.scoreboard = new Scoreboard();
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
		let httpServer = http.createServer((req, res) => {
			let uri = req.url;
			let url = uri;
			if (url.indexOf('?') >= 0)
				url = url.substring(0, url.indexOf('?'));

			if (url == '/')
				url = '/index.html';

			let dirs = url.split('/');
			if (dirs.indexOf('..') >= 0) {
				res.statusCode = 400;
				res.end();
				return;
			}

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
			if (fs.existsSync(webdir + url)) {
				path = webdir + url;
			} else if (fs.existsSync(this.__jsFilesDir + url)) {
				path = this.__jsFilesDir + url;
			} else {
				res.statusCode = 404;
				res.end();
				return;
			}

			let contentType = mime.getType(url);
			res.statusCode = 200;
			if (contentType)
				res.setHeader('Content-Type', contentType);

			let data = fs.readFileSync(path);
			if (url == '/engine.js') {
				res.write('window.DEV = ' + (process.argv.includes('--dev') ? 'true' : 'false') + ';\n');
				res.write('window.GAME_NAME = \'' + bodjo.config.game + '\';\n');
				res.write('window.GAME_SERVER = \'' + bodjo.config.name + '\';\n');
			}

			// let stream = fs.createReadStream(path);
			// stream.on('open', () => stream.pipe(res));
			// stream.on('error', () => res.end());
			res.write(data);
			res.end();
		});
		if (this.config.ssl) {
			if (!containsKeys(this.config.ssl, ['key', 'cert'])) {
				warn(`.start(): SSL options in config file should contain two keys: ${`"key"`.white.bold}, ${`"cert"`.white.bold}.`);
			} else {
				let key = fs.readFileSync(this.config.ssl.key).toString();
				let cert = fs.readFileSync(this.config.ssl.cert).toString();

				let credentials = crypto.createCredentials({key, cert});
				httpServer.addSecure(credentials);

				log("[HTTP] SSL credentials obtained.");
			}
		}
		let io = socketio(httpServer);
		io.use((socket, next) => {
			let query = socket.handshake.query;

			if (keys(bodjo.__players).length >= bodjo.config.maxPlayers) {
				return next(wsErrObj('max players', 6));
			}

			if (typeof query.role !== 'string' ||
				typeof query.username !== 'string') {
				return next(wsErrObj('"role" and "username" should be passed in query', 0));
			}

			if (query.role === 'spectator') {
				if (!bodjo.__players[query.username])
					return next(wsErrObj('player is not found', 1));

				bodjo.__players[query.username].addSpectator(client);
			} else if (query.role === 'player') {

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
					delete bodjo.__players[query.username]
					// return next(wsErrObj('player has already connected', 2));
				}
			} else {
				return next(wsErrObj('role should be "spectator" or "player"', 5));
			}
			return next();
		});
		io.on('connection', socket => {
			let query = socket.handshake.query;
			let role = query.role;
			let username = query.username;

			let player;
			if (role === 'player') {
				player = new Player(socket, username);
				bodjo.__players[username] = player;
				bodjo.emit('player-connect', player);
			}

			socket.emit('scoreboard', bodjo.scoreboard.raw());

			socket.on('disconnect', () => {
				if (username != null && player && bodjo.__players[username]) {
					// player.socket.close();
					delete bodjo.__players[username];
				}
			})
		});
		bodjo.scoreboard.onUpdate = function () {
			for (let username in bodjo.__players)
				bodjo.__players[username].emit('scoreboard', bodjo.scoreboard.raw());
		}
		httpServer.listen(this.config.httpPort, this.config.httpHost || '0.0.0.0', function (error) {
			if (error)
				fatalerr(error);
			else log('[HTTP] HTTP Server is listening at ' + (':'+bodjo.config.httpPort).yellow.bold)
		});

		if (!process.argv.includes('--dev')) {
			let tcpServer = net.createServer((socket) => {
				let authorized = false;
				socket.on('data', function (message) {
					if (message instanceof Buffer)
						message = message.toString();
					if (typeof message !== 'string')
						return;

					let object = null;
					try {
						object = JSON.parse(message);
					} catch (e) { return; }

					if (typeof object !== 'object' ||
						Array.isArray(object) || object == null)
						return;

					if (object.type === 'connect') {
						if (object.name === bodjo.config.name &&
							object.secret === bodjo.config.secret) {
							socket.write(JSON.stringify({type:'connect',status:'ok'}));
							authorized = true;
							log("[TCP] Main server connected successfully.");
						} else {
							socket.write(JSON.stringify({type:'connect',status:'fail'}));
						}
					} else if (object.type === 'new-player') {
						if (!authorized)
							return;

						if (typeof object.username !== 'string' ||
							typeof object.token !== 'string')
							return;

						if (!bodjo.__gameSessionTokens[object.username])
							bodjo.__gameSessionTokens[object.username] = [];

						bodjo.__gameSessionTokens[object.username].push(object.token);
						log("[TCP] Received " + object.username.cyan + "'s gameSessionToken ("+object.token.grey+")");
					}
				});
				socket.on('error', function (error) {
					if (authorized)
						warn("[TCP] Main server connection error.", error);
				})
				socket.on('disconnect', function () {
					if (authorized)
						log("[TCP] Main server disconnected.");
				});
				socket.on('close', function () {
					if (authorized)
						log("[TCP] Main server disconnected.");
				});
			});
			tcpServer.listen(this.config.tcpPort, this.config.tcpHost || '0.0.0.0');
		}
	}
}
class Player {
	constructor(socket, username) {
		this.socket = socket;
		this.username = username;
		this.spectators = [];
	}

	addSpectator(socket) {
		this.spectators.push(socket);
	}

	emit() {
		let data = arr(arguments);
		this.socket.emit.apply(this.socket, data);
		for (let spectator of this.spectators) {
			//if (alive)
			spectator.emit.apply(this.socket, data);
		}
	}

	on() {
		this.socket.on.apply(this.socket, arr(arguments));
	}

	once() {
		this.socket.once.apply(this.socket, arr(arguments));
	}
}
class Scoreboard {
	constructor(filename = "scoreboard.json") {
		this.onUpdate = null;
		this.sortFunction = function (a, b) {
			if (typeof a.value === 'undefined') {
				warn('[scoreboard] write ' + 'bodjo.scoreboard.sortFunction' + ' for sort.');
				return 0;
			}
			return b.value - a.value;
		}

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
		if (this.data[username] != value) {
			this.data[username] = value;
			if (this.onUpdate !== null)
				this.onUpdate();
		} else
			this.data[username] = value;
		this.save();
	}

	save() {
		fs.writeFileSync('scoreboard.json', JSON.stringify(this.data));
	}

	raw() {
		let rawdata = keys(this.data).map(username => {
			if (typeof this.data[username] === 'object' &&
				this.data[username] != null &&
				!Array.isArray(this.data[username]))
				return Object.assign(this.data[username], {username});
			return {username, value: this.data[username]};
		}).sort(this.sortFunction);
		for (let i = 0, place = 1; i < rawdata.length; ++i) {
			rawdata[i].place = place;
			if (i+1 < rawdata.length) {
				if (this.sortFunction(rawdata[i+1], rawdata[i]) > 0)
					place++;
			}
		}
		return rawdata;
	}

	get(username) {
		if (username instanceof Player)
			username = username.username;
		return this.data[username];
	}

	clear() {
		log('[scoreboard] scoreaboard cleared');
		this.data = {};
		this.save();
	}
}
module.exports = BodjoGame;