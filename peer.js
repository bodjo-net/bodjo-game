const B = require('./../bodjo-game/binary.js');
const { RTCPeerConnection, RTCIceCandidate } = require('wrtc');

process.stdin.on('data', (data) => {
	let message = B.decode(data);
	if (message[0] == 'options') {
		start(message[1], message[2]);
	} else if (message[0] == 'candidate') {
		peer.addIceCandidate(new RTCIceCandidate(message[1]))
			.catch(console.error)
	} else if (message[0] == 'answer') {
		peer.setRemoteDescription(message[1])
			.catch(console.error);
	} else if (message[0] == 'message') {
		channel.send(message[1]);
	}
});

let peer, channel;
function start(peerOptions, dataChannelOptions) {
	peer = new RTCPeerConnection(peerOptions);
	peer.onicecandidate = (event) => {
		if (event && event.candidate && event.candidate.protocol === 'udp') {
			process.stdout.write(B.encode(['candidate', event.candidate]));
		}
	};
	channel = peer.createDataChannel('dc', dataChannelOptions);
	channel.onopen = () => {
		process.stdout.write(B.encode(['open']));
	};
	channel.onclose = () => {
		process.stdout.write(B.encode(['close']));
	};
	channel.onmessage = (event) => {
		if (event.type != 'message' ||
			!(event.data instanceof ArrayBuffer))
			return;
		process.stdout.write(B.encode(['message', event.data]));
	}

	peer.createOffer()
		.then(offer => {
			peer.setLocalDescription(offer);
			process.stdout.write(B.encode(['offer', offer]));
		})
		.catch(console.error);
}

