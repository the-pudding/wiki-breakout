import { Howl, Howler } from 'howler';

const files = ['cardi'];
const path = 'assets/audio';
const tracks = {};
let currentID = null;

function pause() {
	// todo fade out previous
}

function play(t) {
	if (currentID) pause();
	currentID = t.id;
	if (tracks[t.id]) {
		tracks[t.id].play();
		// todo change the visual of audio element
		// todo progress indicator
	}
}

function load() {
	let i = 0;

	const loadNext = () => {
		const t = new Howl({
			src: `${path}/${files[i]}.mp3`,
			onload: () => {
				tracks[files[i]] = t;
				// todo check if already in currentID, if so, play instantly
				advance();
			},
			onloaderror: advance
		});
	};

	const advance = err => {
		console.log(tracks);
		i += 1;
		if (i < files.length) loadNext();
	};

	loadNext();
}

function init() {
	load();
}

export default { init, play };
