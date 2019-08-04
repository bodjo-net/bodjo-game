const fs = require('fs');
const readline = require('readline');
const http = require('http');
const https = require('https');

global.arr = function (args) {
	return Array.prototype.slice.apply(args);
}
global.keys = function (obj) {
	return Object.keys(obj);
}
global.contain = function (arr1, arr2) {
	if (!Array.isArray(arr2))
		return arr1.includes(arr2);
	return arr2.every(a => arr1.includes(a));
}
global.containsKeys = function (obj, requiredKeys) {
	return typeof obj === 'object' && !Array.isArray(obj) && obj != null && contain(keys(obj), requiredKeys);
}
global.randomString = function (n = 16) {
	return Array.from({length:n},()=>(q="qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890")[Math.round(Math.random()*(n-1))]).join('');
}

global.promptConfig = async function (filename) {

	let inputs = {
		game: {s: "["+"?".green.bold+"] "+"Game name: ".bold, r: /^[\w\d-]+$/},
		name: {s: "["+"?".green.bold+"] "+"Server name: ".bold, r: /^[\w\d-]+$/},
		secret: {s: "["+"🔑".yellow.bold+"] "+"Server secret: ".bold, r: /^[\w\d-]+$/},
		maxPlayers: {s: "["+"p".red.bold+"] "+"Max players: (16) ".bold, r: /^\d+$/, def: 16},
		httpPort: {s: "["+":".white.bold+"] HTTP Server port: (80) ".bold, r: /^\d+$/, def: 80},
		tcpPort: {s: "["+":".white.bold+"] TCP Server port: (3221) ".bold, r: /^\d+$/, def: 3221}
	};

	let config = tryReadConfig(filename);
	if (!config || !containsKeys(config, keys(inputs))) {

		let rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		console.log("Missing config data.".bold + " (".grey + filename.magenta + " is missing or can't be parsed)".grey);
		if (typeof config !== 'object' ||
			Array.isArray(config) || config == null)
			config = {};

		let missingKeys = keys(inputs).filter(k => typeof config[k] === 'undefined');
		for (let key of missingKeys) {
			config[key] = await question(rl, inputs[key].s, inputs[key].r, inputs[key].def);
		}

		console.log("To obtain your server with SSL certificate, stop process and edit " + filename.magenta + " file.\nAdd "+"\"ssl\"".white.bold+" object with " + "\"key\"".white.bold + " & " + "\"cert\"".white.bold+" keys, that lead to files with certificate.\n");
		fs.writeFileSync(filename, JSON.stringify(config, null, '\t'));

		rl.close();
		
	}


	return config;
}
global.wsErrObj = function (reason, reasonid) {
	return new Error(JSON.stringify({status:'err',reason,reasonid}));
}

function question (rl, string, regex, def) {
	return new Promise((resolve, reject) => {
		rl.question(string, function onAnswer (answer) {
			if (answer.length == 0 && typeof def !== 'undefined') {
				// process.stdout.write(def.toString());
				resolve(def);
				return;
			}


			if (regex.test(answer))
				resolve(answer);
			else rl.question(string, onAnswer);
		});
	});
}

function tryReadConfig(configFilename) {
	if (!fs.existsSync(configFilename))
		return {};
	try {
		return JSON.parse(fs.readFileSync(configFilename).toString());
	} catch (e) {
		return {};
	}
}

global.GET = function (URL) {
	return new Promise((resolve, reject) => {
		let proto = URL.indexOf("https:") == 0 ? https : http;
		let req = proto.request(URL, (res) => {
			let chunks = [];
			res.on('error', reject);
			res.on('data', chunk => chunks.push(chunk));
			res.on('end', () => {
				resolve(Buffer.concat(chunks).toString());
			})
		});
		req.on('error', reject);
		req.end();
	});
}