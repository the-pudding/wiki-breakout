import { Howl, Howler } from 'howler';
import files from './tracks.json';

const FADE_OUT = 500;
const path = 'assets/audio';
const tracks = {};
let current = null;

function pause() {
	// todo fade out previous
	const t = tracks[current.id];
	if (t) {
		t.fade(t.volume(), 0, FADE_OUT);
		d3.select(current.el).st('color', 'black');
	}
}

function play(t) {
	if (current && current.id !== t.id) pause();
	current = t;
	if (tracks[t.id] && !tracks[t.id].playing()) {
		tracks[t.id].play();
		tracks[t.id].volume(1);
		d3.select(t.el).st('color', 'red');
		// todo progress indicator
	}
}

function load() {
	let i = 0;

	const loadNext = () => {
		const f = files[i].id;
		const t = new Howl({
			src: `${path}/${f}.mp3`,
			onload: () => {
				tracks[f] = t;
				if (current && current.id === f) play(current);
				advance();
			},
			onloaderror: advance,
			onfade: () => {
				tracks[f].stop();
			}
		});
	};

	const advance = err => {
		i += 1;
		if (i < files.length) loadNext();
	};

	loadNext();
}

function init() {
	load();
}

export default { init, play };
