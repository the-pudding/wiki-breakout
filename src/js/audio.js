import { Howl, Howler } from 'howler';
import files from './tracks.json';

const FADE_OUT = 500;
const path = 'assets/audio';
const tracks = {};
let current = null;
let progressCallback = null;
let timer = null;

Howler.volume(0.75);

function pause() {
	// todo fade out previous
	const t = tracks[current.id];
	if (t) {
		t.fade(t.volume(), 0, FADE_OUT);
		d3.select(current.el).st('color', 'black');
	}
}

function progress() {
	if (tracks[current.id].playing() && progressCallback) {
		const duration = tracks[current.id].duration();
		const seek = tracks[current.id].seek();
		progressCallback({ id: current.id, duration, seek });
	}
	timer = d3.timeout(progress, 250);
}

function play({ t, cb }) {
	progressCallback = cb;
	if (current && current.id !== t.id) pause();
	current = t;
	if (tracks[t.id] && !tracks[t.id].playing()) {
		tracks[t.id].play();
		tracks[t.id].volume(1);
		d3.select(t.el).st('color', 'red');
		timer = d3.timeout(progress, 250);
	}
}

function load(cb) {
	let i = 0;

	const loadNext = () => {
		const f = files[i].id;
		const t = new Howl({
			src: `${path}/${f}.mp3`,
			onload: () => {
				tracks[f] = t;
				cb({ id: f, duration: t.duration(), seek: 0 });
				if (current && current.id === f) play({ t: current });
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

function init(cb) {
	load(cb);
}

export default { init, play };
