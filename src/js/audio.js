import { Howl, Howler } from 'howler';

const FADE_DUR = 250;
const path = 'assets/audio';
const pathBg = 'assets/preview';
const tracks = {};
const bg = {};
const annotations = {};
let current = null;
let currentBg = null;
let progressCallback = null;
let progressAnnoCallback = null;
let currentAnno = null;
let timer = null;
let files = [];
let bgFiles = [];
let annoFiles = [];

Howler.volume(0);

function pauseAnno({ article, id }) {
	if (annotations[id]) {
		annotations[id].stop();
		const $a = d3
			.selectAll('.person .annotation')
			.classed('is-playing', false)
			.st('background-color', '#ffe566');
		$a.select('.icon').classed('is-visible', true);
		$a.select('.time').classed('is-visible', false);
		d3.select(`.person[data-article="${article}"] .annotation`).classed(
			'is-playing',
			false
		);
	}
}

function playAnno({ article, id, cb }) {
	progressAnnoCallback = cb;
	Howler.volume(0.75);
	if (currentAnno) annotations[currentAnno.id].stop();
	if (annotations[id]) {
		const $a = d3
			.selectAll('.person .annotation')
			.classed('is-playing', false)
			.st('background-color', '#ffe566');
		$a.select('.icon').classed('is-visible', true);
		$a.select('.time').classed('is-visible', false);
		d3.select(`.person[data-article="${article}"] .annotation`).classed(
			'is-playing',
			true
		);
		currentAnno = { id, article };
		annotations[id].play();
		timer = d3.timeout(progressAnno, 250);
	}
}

function toggle(should) {
	Howler.volume(should ? 0.75 : 0);
}

function mute(m) {
	Howler.mute(m);
}

function pause() {
	// todo fade out previous
	const t = tracks[current.id];
	if (t && t.playing()) {
		t.fade(t.volume(), 0, FADE_DUR);
		d3.select(current.el).st('color', 'black');
	}
}

function progressAnno() {
	if (annotations[currentAnno.id].playing() && progressAnnoCallback) {
		const duration = annotations[currentAnno.id].duration();
		const seek = annotations[currentAnno.id].seek();
		progressAnnoCallback({ article: currentAnno.article, duration, seek });
	}
	timer = d3.timeout(progressAnno, 250);
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
	const track = tracks[t.id];
	if (track && !track.playing()) {
		track.play();
		track.volume(1);
		d3.select(t.el).st('color', 'red');
		timer = d3.timeout(progress, 250);
	}
}

function pauseBg() {
	const track = bg[currentBg];
	if (track && track.playing()) track.fade(track.volume(), 0, FADE_DUR * 2);
}

function playBg(article) {
	if (currentBg !== article) pauseBg();
	currentBg = article;
	const track = bg[article];
	if (track && !track.playing()) {
		track.volume(0);
		track.play();
		track.fade(0, 0.4, FADE_DUR * 4);
	}
}

function loadAnno() {
	let i = 0;

	const loadNext = () => {
		const f = annoFiles[i].id;
		const a = annoFiles[i].article;
		const t = new Howl({
			src: `${path}/${f.replace(/[^\w]/g, '')}.mp3`,
			loop: false,
			onload: () => {
				annotations[f] = t;
				const $a = d3.select(`.person[data-article="${a}"] .annotation`);
				$a.classed('is-visible', true);
				advance();
			},
			onloaderror: advance
		});
	};

	const advance = () => {
		i += 1;
		if (i < annoFiles.length) loadNext();
	};

	loadNext();
}

function loadBg() {
	let i = 0;

	const loadNext = () => {
		const f = bgFiles[i];
		const t = new Howl({
			src: `${pathBg}/${f.replace(/[^\w]/g, '')}.mp3`,
			loop: true,
			onload: () => {
				bg[f] = t;
				if (currentBg === f) playBg(currentBg);
				advance();
			},
			onloaderror: advance,
			onfade: () => {
				if (f !== currentBg) bg[f].stop();
			}
		});
	};

	const advance = () => {
		i += 1;
		if (i < bgFiles.length) loadNext();
	};

	loadNext();
}

function load(cbProgress, cbEnd) {
	let i = 0;

	const loadNext = () => {
		const f = files[i].id;
		const t = new Howl({
			src: `${path}/${f}.mp3`,
			onload: () => {
				tracks[f] = t;
				cbProgress({ id: f, duration: t.duration(), seek: 0 });
				if (current && current.id === f) play({ t: current });
				advance();
			},
			onloaderror: advance,
			onend: cbEnd,
			onfade: () => {
				tracks[f].stop();
			}
		});
	};

	const advance = () => {
		i += 1;
		if (i < files.length) loadNext();
		else loadBg();
	};

	loadNext();
}

function init(
	peopleData,
	trackData,
	annotationData,
	cbProgress,
	cbEnd,
	mobile
) {
	files = trackData.map(t => ({ id: t.id }));
	bgFiles = peopleData.filter(d => d.spotify_url).map(d => d.article);
	annoFiles = annotationData.map(t => ({ article: t.person, id: t.id }));
	if (mobile) loadAnno();
	else load(cbProgress, cbEnd);
}

export default { init, play, playBg, mute, toggle, playAnno, pauseAnno };
