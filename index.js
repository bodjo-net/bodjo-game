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

		this.__serverURL = await GET("https://bodjo.net/SERVER_IP");
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

			if (url == '/engine.js') {
				res.write('window.DEV = ' + (process.argv.includes('--dev') ? 'true' : 'false') + ';\n');
				res.write('window.GAME_NAME = \'' + bodjo.config.game + '\';\n');
				res.write('window.GAME_SERVER = \'' + bodjo.config.name + '\';\n');
			}

			let stream = fs.createReadStream(path);
			stream.on('open', () => stream.pipe(res));
			stream.on('error', () => res.end());
	
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

			if (typeof query.role !== 'string' ||
				typeof query.username !== 'string') {
				return next(wsErrObj('"role" and "username" should be passed in query', 0));
			}

			if (query.role === 'spectator') {
				if (!bodjo.__players[query.username])
					return next(wsErrObj('player is not found', 1));

				bodjo.__players[query.username].addSpectator(client);
			} else if (query.role === 'player') {
				if (bodjo.__players[query.username])
					return next(wsErrObj('player has already connected', 2));

				if (typeof query.token !== 'string')
					return next(wsErrObj('gameSessionToken in query is not found (key "token")', 3));

				if (!process.argv.includes('--dev') &&
					(!bodjo.__gameSessionTokens[username] ||
					 !bodjo.__gameSessionTokens[username].includes(query.token))) {
					return next(wsErrObj('gameSessionToken is invalid', 4));
				}
			} else {
				return next(wsErrObj('role should be "spectator" or "player"', 5));
			}
			return next();
		});
		io.on('connection', socket => {
			if (keys(bodjo.__players).length >= bodjo.config.maxPlayers) {
				socket.emit('connect', {status: 'err', reason: 'max players'});
				socket.close();
				return;
			}

			let query = socket.handshake.query;
			let role = query.role;
			let username = query.username;

			let player;
			if (role === 'player') {
				player = new Player(socket, username);
				bodjo.__players[username] = player;
				bodjo.emit('player-connect', player);
			}

			socket.on('disconnect', () => {
				if (username != null && player && bodjo.__players[username]) {
					// player.socket.close();
					delete bodjo.__players[username];
				}
			})
		});
		httpServer.listen(this.config.httpPort, 'bodjo', function (error) {
			if (error)
				fatalerr(error);
			else log('[HTTP] HTTP Server is listening at ' + (':'+bodjo.config.httpPort).yellow.bold)
		});


		let tcpServer = net.createServer((socket) => {
			let authorized = false;
			socket.on('data', function (message) {
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
					if (object.name === config.name &&
						object.secret === config.secret) {
						socket.send(JSON.stringify({type:'connect',status:'ok'}));
						authorized = true;
						log("[TCP] Main server connected successfully.");
					} else {
						socket.send(JSON.stringify({type:'connect',status:'err'}));
					}
				} else if (object.type === 'new-player') {
					if (typeof object.username !== 'string' ||
						typeof object.token !== 'string') {
						socket.send(JSON.stringify({type:'new-player',status:'err'}));
						return;
					}

					if (!bodjo.__gameSessionTokens[object.username])
						bodjo.__gameSessionTokens[object.username] = [];

					bodjo.__gameSessionTokens[object.username].push(object.token);
					log("[TCP] Received " + object.username.cyan + "'s gameSessionToken ("+object.token.grey+")");
				}
			});
			socket.on('close', function () {
				if (authorized)
					log("[TCP] Main server disconnected.");
			});
		});
		tcpServer.listen(this.config.tcpPort);
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
module.exports = BodjoGame;