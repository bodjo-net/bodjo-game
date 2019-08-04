require('colors');
global.log = function () {
	console.log(`[${date().bold}] [${'log'.cyan.bold}] ` + arr(arguments).map(toString).join(' '));
}
global.debug = function () {
	console.log(`[${date().bold}] [${'debug'.cyan}] ` + arr(arguments).map(toString).join(' '));
}
global.warn = function () {
	let args = arr(arguments), error = null;
	if (args.length > 0 &&
		typeof args[args.length - 1].stack === 'string') {
		error = args[args.length - 1];
		args.splice(args.length - 1, 1);
	}
	console.log(`[${date().bold}] [${'warn'.yellow.bold}] ` + args.map(toString).join(' '));
	if (error != null)
		console.log(error.stack);
}
global.warnShort = function () {
	console.log(`[${date().bold}] [${'warn'.yellow.bold}] ` + arr(arguments).map(toString).join(' '));
}
global.err = function () {
	let args = arr(arguments), error = null;
	if (args.length > 0 &&
		typeof args[args.length - 1].stack === 'string') {
		error = args[args.length - 1];
		args.splice(args.length-1, 1);
	}
	console.log(`[${date().bold}] [${'err'.red.bold}] ` + args.map(toString).join(' '));
	if (error != null)
		throw (error.stack);
}
global.errShort = function () {
	console.log(`[${date().bold}] [${'err'.yellow.bold}] ` + arr(arguments).map(toString).join(' '));
}
global.fatalerr = function () {
	let args = arr(arguments), error = null;
	if (args.length > 0 &&
		typeof args[args.length - 1].stack === 'string') {
		error = args[args.length - 1];
		args.splice(args.length-1, 1);
	}
	console.log(`[${date().bold}] [${'fatal-err'.red.bold}] ` + args.map(toString).join(' '));
	if (error != null)
		throw (error.stack);
	process.exit(0);
}
function toString(o) {
	if (o instanceof Error)
		return o.toString().red.bold;
	if (typeof o === 'object')
		return JSON.stringify(o, null, '\t');
	return o+'';
}
function date(separator, dateOnly) {
	let d = new Date();
	let res = [
		[
			addZeros(d.getDate()), 
			addZeros(d.getMonth()),
			addZeros(d.getFullYear()-2000)
		].join(separator || '.'),
		dateOnly ? '' : [
			addZeros(d.getHours()),
			addZeros(d.getMinutes()),
			addZeros(d.getSeconds())
		].join(':')
	].join(separator || ' ') + (!dateOnly ? '.'+addZeros(d.getMilliseconds(), 3) : '');
	if (dateOnly)
		res = res.slice(0, res.length - 1);
	return res;
}
function addZeros(string, n) {
	if (typeof string !== 'string')
		string = string + '';
	if (typeof n !== 'number')
		n = 2;
	if (string.length >= n)
		return string;
	return '0'.repeat(n - string.length) + string;
}