module.exports = {};
module.exports.encode = function (data) {
	let buffers = data.map(B);
	let u = new Array(buffers.length*2 + 1);
	u[0] = Uint8(buffers.length);
	for (let i = 0; i < buffers.length; ++i)
		u[1 + i] = Uint16(buffers[i].byteLength);
	for (let i = 0; i < buffers.length; ++i)
		u[1 + buffers.length + i] = buffers[i];

	return Buffer.from(concat.apply(this, u));
}
module.exports.decode = function (data) {
	if (data instanceof Buffer)
		data = data.buffer;
	let len = (new Uint8Array(data.slice(0, 1)))[0];
	let lens = new Uint16Array(data.slice(1, 1+len*2));
	let buffs = new Array(len);
	for (let i = 0, j = 1 + len * 2; i < len; ++i) {
		buffs[i] = data.slice(j, j + lens[i]);
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
	return elements;
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
	return buff.buffer;
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
function arr(args) {
	return Array.prototype.slice.apply(args);
}