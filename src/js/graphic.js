/* global d3 */
import 'stickyfilljs';
import Audio from './audio';
import loadImage from './utils/load-image';
import tracker from './utils/tracker';
import { tracks, annotations } from './tracks.json';

// reverse subtitles
tracks.forEach(t => {
	t.subtitles.reverse();
	t.prevMid = 1;
	t.curMid = 1;
	t.start = +t.start;
	t.end = +t.end;
	t.people = t.people.split(',').map(d => d.trim());
	t.subtitles = t.subtitles.map(s => ({ ...s, time: s.time ? +s.time : 0 }));
	if (t.tutorial) t.tutorial = t.tutorial.map(v => ({ ...v, time: +v.time }));
});

const volumeSvg =
	'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-volume-2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';

let first = true;
let ticking = false;
let mobile = false;
let width = 0;
let height = 0;
let personW = 0;
let personH = 0;
let windowH = 0;
let halfH = 0;
let infoElH = 0;
let joinedData = [];
let currentNametagIndex = -1;
let nameHeight = 0;
let prevPersonIndex = -1;
let prevTrack = null;

const fallbackImg = 'assets/img/fallback.jpg';
const margin = { top: 0, right: 0, bottom: 0, left: 0 };
const svgMargin = { top: 16, right: 32, bottom: 24, left: 54 };
const BP = 880;
const LEVELS = [0, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const LEVELS_REVERSE = LEVELS.map(d => d).reverse();
const COLORS = [
	'#ffe566',
	'#ffd365',
	'#ffc164',
	'#ffad63',
	'#ff9a62',
	'#ff8460',
	'#ff6c5e',
	'#ff4f5c',
	'#ff1f5a'
];

const scale = {
	snakeX: d3.scaleLinear().domain([0, 39]),
	snakeY: d3.scaleLinear().domain([0, 9]),
	gridX: d3.scaleLinear(),
	gridY: d3.scaleLinear(),
	time: d3.scaleQuantize().range(COLORS.map(d => d).reverse())
};

const $main = d3.select('main');
const $section = $main.select('#graphic');
const $people = $section.select('.graphic__people');
const $tracks = $section.select('.graphic__tracks');
const $nametag = $section.select('.graphic__nametag');
const $grid = $section.select('.graphic__grid');
const $legend = $section.select('.graphic__legend');
const $subtitles = $section.select('.graphic__subtitles');
const $subtitlesP = $subtitles.select('p');
const $options = $section.select('.graphic__options');
const $optMute = $options.select('.btn--mute');
const $optSub = $options.select('.btn--sub');
const $begin = $main.select('.intro__begin');
const $intro = $main.select('.intro');

let $person = $people.selectAll('.person'); // empty to start
let $nametagName = $nametag.selectAll('.name');

const imageSet = new Set();

let personElements = [];
let infoElements = [];

function zeroPad(number) {
	return d3.format('02')(number);
}

function preloadImages(data) {
	let i = data.length - 1;

	const next = () => {
		const url = data[i].thumbnail_source;
		loadImage(url, err => {
			if (!err) {
				imageSet.add(data[i].thumbnail_source, true);
				$people
					.select(`[data-article="${data[i].article}"]`)
					.select('.thumbnail')
					.st('background-image', `url(${data[i].thumbnail_source})`);
			}
			i -= 1;
			if (i > -1) next();
		});
	};

	next();
}

function updateTip({ $svg, d, oX, y, index }) {
	const { pageviews_median, timestamp } = d.monthly[index];
	const date = new Date(
		`${timestamp.substring(0, 4)}-${timestamp.substring(
			4,
			6
		)}-${timestamp.substring(6, 8)}`
	);

	const $tip = $svg.select('.g-tip').translate([scale.snakeX(index), y]);
	$tip.classed('is-visible', true);

	$tip
		.selectAll('.views')
		.at('x', oX < personW / 1.8 ? 8 : -8)
		.at('y', scale.snakeY(1) - y)
		.at('text-anchor', oX < personW / 1.8 ? 'start' : 'end')
		.text(`Daily views: ${d3.format(',')(pageviews_median)}`);

	$tip
		.selectAll('.date')
		.at('x', oX < personW / 1.8 ? 8 : -8)
		.at('y', scale.snakeY(1) - y - 16)
		.at('text-anchor', oX < personW / 1.8 ? 'start' : 'end')
		.text(`${d3.timeFormat('%b %Y')(date)}`);

	$tip.select('line').at({
		x1: 0,
		x2: 0,
		y1: -y,
		y2: personH - y
	});
}
function handleMouseMove(d) {
	const $svg = d3.select(this);
	const [x, y] = d3.mouse(this);
	const oX = x - svgMargin.left;
	const i = Math.round(scale.snakeX.invert(oX));
	const len = d.monthly.length - 1;
	const index = Math.min(Math.max(0, i), len);
	updateTip({ $svg, d, oX, y, index });
}

function handleMouseLeave() {
	const $svg = d3.select(this);
	$svg.select('.g-tip').classed('is-visible', false);
}

function handleNameClick(d) {
	const $p = $people.select(`[data-article="${d.article}"]`);
	const $i = $p.select('.info');
	$person.classed('is-active', false);
	$p.classed('is-active', true).raise();
	const { top } = $i.node().getBoundingClientRect();
	const shift = top - halfH;
	const curY = window.scrollY;
	window.scrollTo(0, curY + shift);
}

function handlePersonEnter({ article }) {
	const $p = d3
		.select(this)
		.parent()
		.parent();

	const datum = $p.datum();
	datum.z_index = 1002;

	$p.datum(datum)
		.classed('is-hover', true)
		.at('data-opacity', $p.st('opacity'))
		.st('opacity', 1)
		.st('z-index', d => d.z_index)
		.datum(datum);

	$people.select(`[data-article="${article}"]`).st('opacity', 1);
}

function handlePersonExit({ article }) {
	$people.select(`[data-article="${article}"]`).st('opacity', 0.1);
	const $p = d3
		.select(this)
		.parent()
		.parent();

	const active = $p.classed('is-active');
	const highlight = $p.classed('is-highlight');
	const datum = $p.datum();
	if (active) datum.z_index = 1001;
	else if (highlight) datum.z_index = 1000;
	else datum.z_index = datum.sort_val;

	$p.classed('is-hover', false)
		.st('opacity', +$p.at('data-opacity'))
		.st('z-index', d => d.z_index);
}

function translatePerson(d) {
	return [
		scale.gridX(d.svg.x) - margin.left,
		scale.gridY(d.svg.y) - margin.top - d.svg.start_y
	];
}

function toggleAnnotation(d) {
	const $btn = d3.select(this);
	const { article } = d;
	const id = $btn.at('data-id');
	if ($btn.classed('is-playing')) {
		$btn.classed('is-playing', false);
		Audio.pauseAnno({ article, id });
		$btn.select('.time').classed('is-visible', false)
		$btn.select('.icon').classed('is-visible', true)
	} else {
		Audio.playAnno({ article, id, cb: handleAnnoProgress });
	}
}

function renderAnnotations() {
	const persons = annotations.map(d => d.person);
	$person.filter(d => persons.includes(d.article)).each((d, i, n) => {
		const $p = d3.select(n[i]);
		$p.select('button.annotation')
			.at('data-id', d => annotations.find(a => a.person === d.article).id)
			.on('click', toggleAnnotation);
	});
}

function renderTracks() {
	const $trackEnter = $tracks
		.selectAll('.track')
		.data(tracks)
		.enter()
		.append('div.track')
		.at('data-id', d => d.id);
	$trackEnter.append('p.timer');

	$trackEnter.each((d, i, n) => {
		tracks[i].el = n[i];
		tracks[i].timerEl = d3
			.select(n[i])
			.select('.timer')
			.node();
	});
}

function renderNametag(data) {
	const reverse = data.map(d => d).reverse();
	const $name = $nametag.selectAll('li.name').data(reverse, d => d.article);

	const $nameEnter = $name.enter().append('li.name');

	$nameEnter
		.at('data-article', d => d.article)
		.text(d => d.display)
		.classed('is-rising', d => {
			const l = +d.monthly[d.monthly.length - 3].level;
			return l < 6;
		})
		.on('click', handleNameClick);

	$nametagName = $nameEnter.merge($name);
}

function renderPerson(data) {
	if (mobile) data.reverse();
	$person = $people.selectAll('.person').data(data, d => d.article);

	const $personEnter = $person.enter().append('div.person');
	const $infoEnter = $personEnter.append('div.info');
	const $chartEnter = $personEnter.append('div.chart');
	const $svgEnter = $chartEnter.append('svg.viz');

	if (mobile) $personEnter.classed('is-active', true);

	$svgEnter
		.on('mousemove touchmove', handleMouseMove)
		.on('mouseleave touchend', handleMouseLeave);

	$svgEnter.append('g.g-axis');
	const $visEnter = $svgEnter.append('g.g-vis');

	$personEnter.at('data-article', d => d.article).st('z-index', d => d.z_index);
	$personEnter.at('data-y', d => d.svg.y);

	const $name = $infoEnter.append('p.name');
	$name.append('span.display');
	$name.append('span.description');

	const $a = $name.append('button.annotation');
	$a.append('div.icon.is-visible').html(volumeSvg);
	$a.append('p.time');

	$infoEnter
		.append('div.thumbnail')
		.on('mouseenter touchstart', handlePersonEnter)
		.on('mouseleave touchend', handlePersonExit);

	$visEnter.append('path.snake--outer').at('d', d => d.svg.outer);

	$visEnter.append('path.snake--inner').at('d', d => d.svg.inner);

	// $visEnter.append('path.spine').at('d', d => d.svg.spine);

	const $tipEnter = $visEnter.append('g.g-tip');
	$tipEnter.append('line');
	$tipEnter.append('text.date.bg');
	$tipEnter.append('text.date.fg');
	$tipEnter.append('text.views.bg');
	$tipEnter.append('text.views.fg');

	$person = $personEnter.merge($person);

	personElements = $person.nodes();
	infoElements = $person.select('.info').nodes();
	infoElH = infoElements[0].offsetHeight;

	$person.select('.name .display').text(d => d.display);
	$person.select('.name .description').text(d => d.category_specific);
	$person.select('.thumbnail').st('background-image', `url(${fallbackImg})`);
}

function updateDimensions() {
	personW = 256;
	personH = 192;
	const w = $section.node().offsetWidth;
	windowH = window.innerHeight;
	mobile = w < BP;
	const target = mobile ? 2 / 3 : 1 / 2;
	halfH = Math.floor(windowH * target) - infoElH / 2;
	margin.left = mobile ? 32 : personW * 0.67;
	margin.right = mobile ? 32 : personW * 0.67;
	margin.top = personH * 1.25;
	margin.bottom = personH * 0.25;

	width = w - margin.left - margin.right;
	height = 6000 - margin.top - margin.bottom;
}

function resize() {
	updateDimensions();
	if (!mobile)
		$people.st({ width, height, top: margin.top, left: margin.left });
	$tracks.st({ width: margin.left, height, top: personH / 2 });

	scale.gridX.range([margin.left, width - margin.right]);
	scale.gridY.range([margin.top, height - margin.bottom]);

	$tracks.selectAll('.track').each((d, i, n) => {
		const $el = d3.select(n[i]);
		const top = scale.gridY(d.start);
		const h = scale.gridY(d.end) - top;
		$el.st({ top: 0, height: h });
		$el.select('.timer').st('top', mobile ? '40px' : '50%');
	});

	scale.snakeX.range([0, personW]);
	scale.snakeY.range([personH, 0]);

	$person.each((d, i, n) => {
		const [x, y] = translatePerson(d);
		const $p = d3.select(n[i]);
		if (!mobile) {
			$p.st('top', y).st('left', x);
			$p.select('.info').st('top', d.svg.start_y + svgMargin.top);
			$p.select('.info .name').st('max-width', mobile ? '100%' : margin.left);
		}
		$p.select('.chart').st({
			width: personW + svgMargin.left + svgMargin.right,
			height: personH + svgMargin.top + svgMargin.bottom
		});
		const $svg = $p.select('svg.viz');
		// $svg.at({
		// 	width: personW + svgMargin.left + svgMargin.right,
		// 	height: personH + svgMargin.top + svgMargin.bottom
		// });
		// .st('left', mobile ? -x - margin.left : 'auto')

		$svg.select('.g-vis').translate([svgMargin.left, svgMargin.top]);
		const $axis = $svg.select('.g-axis');
		$axis.translate([svgMargin.left, svgMargin.top]);
		$axis.select('.axis--x').translate([0, personH]);
	});

	$person
		.select('.axis')
		.select('.axis--x')
		.translate([0, personH]);

	if ($nametagName.size())
		nameHeight = $nametag.select('.name').node().offsetHeight;
	$grid.select('.grid__x').st('padding', `0 ${mobile ? 8 : 32}px`);
	$grid.select('.grid__y').st('padding', `0 ${mobile ? 128 : 32}px`);
}

function cleanDisplay(str) {
	const index = str.indexOf('(');
	if (index > -1) return str.substring(0, index).trim();
	return str.trim();
}

function joinData(data) {
	const joined = data[0]
		.map(d => ({
			...d,
			display: cleanDisplay(d.display),
			svg: data[1][d.article],
			monthly: data[2].filter(m => m.article === d.article)
		}))
		.map(d => ({
			...d,
			sort_val: Math.round(+d.svg.y * 999),
			z_index: Math.round(+d.svg.y * 999),
			svg: {
				...d.svg,
				start_y: +d.svg.start_y,
				x: +d.svg.x,
				y: +d.svg.y
			}
		}));
	joined.sort((a, b) => d3.descending(a.sort_val, b.sort_val));
	return joined;
}

function injectData() {
	const $el = d3.select(this);
	const article = $el.at('data-article');
	const start = +$el.at('data-start-y');
	const x = +$el.at('data-x');
	const y = +$el.at('data-y');
	$el.node().__data__ = {
		article,
		svg: {
			start_y: start,
			x,
			y
		}
	};
}

function preBindData() {
	$visPerson = $vis.selectAll('.person');
	$visPerson.each(injectData);
}

function updateNametag(el) {
	const $p = d3.select(el);
	const article = $p.at('data-article');
	const $name = $nametag.select(`[data-article="${article}"]`);
	$nametag.selectAll('.name').classed('is-active', false);
	$name.classed('is-active', true);

	const shift = (joinedData.length - currentNametagIndex) * -nameHeight;
	$nametag.st('margin-top', shift + nameHeight * 0.5);
}

function updateInfo(el) {
	const $p = d3.select(el);
	$person.classed('is-active', false);
	$p.classed('is-active', true);
}

function showTutorial(seek) {
	tracks[0].tutorial.forEach(t => {
		if (!t.done && seek > t.time) {
			t.done = true;
			// trigger
			if (t.trigger === 'grid-y') {
				$grid.select('.grid__y .y--top').classed('is-tutorial', true);
			} else if (t.trigger === 'grid-x') {
				$grid.select('.grid__x .x--left').classed('is-tutorial', true);
			} else if (t.trigger === 'axis') {
				$person
					.filter(d => d.article === 'Cardi_B')
					.selectAll('.tick')
					.classed('is-tutorial', true);
			} else if (t.trigger === 'cardi') {
				const $svg = $person.filter(d => d.article === 'Cardi_B');
				updateTip({ $svg, d: $svg.datum(), oX: 0, y: 0, index: 19 });
			} else if (t.trigger === 'out') {
				const $svg = $person.filter(d => d.article === 'Cardi_B');
				$svg.select('.g-tip').classed('is-visible', false);
			}
		}
	});
}

function updateSubtitle({ id, seek }) {
	const { subtitles } = tracks.find(t => t.id === id);
	const { text } = subtitles.find(s => seek >= s.time);
	$subtitlesP.text(text);
}

function handleAudioEnd() {
	$subtitles.classed('is-end', true);
}

function handleAnnoProgress({ article, duration, seek }) {
	// $subtitles.classed('is-end', false);
	scale.time.domain([0, Math.ceil(duration)]);
	const s = Math.max(0, Math.round(duration - seek))
	const seconds = zeroPad(s);
	const $a = $people
		.select(`[data-article="${article}"] .annotation`)
		.st('background-color', scale.time(seconds));
	$a.select('.icon').classed('is-visible', false);
	$a.select('.time').classed('is-visible', true).text(`:${seconds}`);
	if (s <= 0) {
		$a.classed('is-playing', false)
			.st('background-color', scale.time.range()[0]);
		$a.select('.icon').classed('is-visible', true);
		$a.select('.time').classed('is-visible', false);
	}
	// if (seek > 0) updateSubtitle({ id, seek });
}

function handleAudioProgress({ id, duration, seek }) {
	if (first) {
		first = false;
		$begin.selectAll('span').text('Start Audio Tour');
		if (!mobile) setupMode();
	}
	$subtitles.classed('is-end', false);
	scale.time.domain([0, Math.ceil(duration)]);
	const seconds = zeroPad(Math.max(0, Math.round(duration - seek)));
	$tracks
		.select(`[data-id='${id}'] .timer`)
		.text(`:${seconds}`)
		.st('background-color', scale.time(seconds));

	if (id === 'intro') showTutorial(seek);
	if (seek > 0) updateSubtitle({ id, seek });
}

function highlightPeople(people) {
	$person.classed('is-highlight', false);
	people.forEach(p => {
		const $p = $people.select(`[data-article="${p}"]`);
		const datum = $p.datum();
		datum.z_index = 1000;
		$p.classed('is-highlight', true)
			.datum(datum)
			.st('opacity', 1)
			.st('z-index', d => d.z_index);
	});
}

function resetPerson($p) {
	const datum = $p.datum();
	datum.z_index = datum.sort_val;

	$p.datum(datum).st('z-index', d => d.z_index);
}

// lifted from enter-view
function updateScroll() {
	ticking = false;
	const closest = { index: null, fromMid: 9999 };
	infoElements.forEach((el, i) => {
		const { top } = el.getBoundingClientRect();
		const fromMid = Math.abs(top - halfH);
		const percent = Math.min(1, Math.max(0, fromMid / halfH));
		const percentInverted = 1 - percent;
		if (fromMid < closest.fromMid) {
			closest.fromMid = fromMid;
			closest.index = i;
		}

		const opacity = Math.min(0.67, percentInverted * percentInverted);

		const $el = d3.select(personElements[i]);
		if (!$el.classed('is-highlight')) $el.st({ opacity });
	});

	const el = personElements[closest.index];
	const $p = d3.select(el);
	if (currentNametagIndex !== closest.index) {
		currentNametagIndex = closest.index;
		updateNametag(el);
		updateInfo(el);
		const datum = $p.datum();
		if (datum.spotify_url) Audio.playBg(datum.article);
	}

	tracks.forEach(t => {
		const { top } = t.timerEl.getBoundingClientRect();
		const fromMid = top - halfH;
		t.prevMid = t.curMid;
		t.curMid = fromMid;
	});

	// const filteredTracks = tracks.filter(t => t.prevMid * t.curMid <= 0);
	// filteredTracks.sort((a, b) =>
	// 	d3.descending(Math.abs(a.curMid), Math.abs(b.curMid))
	// );
	// const trackToPlay = filteredTracks.pop();
	const trackToPlay = tracks.find(t => t.curMid === t.prevMid);
	if (trackToPlay) {
		if (trackToPlay.id !== prevTrack)
			Audio.play({ t: trackToPlay, cb: handleAudioProgress });
		prevTrack = trackToPlay.id;
		highlightPeople(trackToPlay.people);
	}

	const scrollPast = mobile ? $intro.node().offsetHeight : 0;
	const showGrid = closest.index > 0 && window.scrollY > scrollPast;
	$grid.classed('is-visible', showGrid);
	$legend.classed('is-visible', showGrid);
	$nametag.classed('is-visible', showGrid);
	$options.classed('is-visible', showGrid);
	$tracks.classed('is-visible', showGrid);
	$subtitles.classed('is-visible', showGrid);
	$person.selectAll('.chart').classed('is-visible', showGrid);

	const datum = $p.datum();
	datum.z_index = 1001;

	d3.select(el)
		.datum(datum)
		.st('opacity', 1)
		.st('z-index', d => d.z_index);

	if (prevPersonIndex >= 0 && prevPersonIndex !== closest.index)
		resetPerson(d3.select(personElements[prevPersonIndex]));
	prevPersonIndex = closest.index;

	// window.requestAnimationFrame(updateScroll);
}

function onScroll() {
	if (!ticking) {
		ticking = true;
		window.requestAnimationFrame(updateScroll);
	}
}

function setupScroll() {
	// onScroll();
	window.addEventListener('scroll', onScroll, true);
}

function setupGradient() {
	let total = 0;
	let tally = 0;

	const temp = LEVELS_REVERSE.map((d, i) => {
		const cur = (LEVELS.length - i) * 2 + 1;
		total += cur;
		return cur;
	}).map(d => {
		tally += d;
		return tally / total;
	});

	const steps = temp.map((d, i) => {
		if (i === 0) return d;
		return d - (d - temp[i - 1]) / 2;
	});

	const $defsI = $section.append('svg#gradient--inner').append('defs');

	const gradientI = $defsI
		.append('linearGradient')
		.at('id', 'linear-gradient--inner')
		.at('gradientUnits', 'userSpaceOnUse')
		.at('x1', '0%')
		.at('x2', '0%')
		.at('y1', '0%')
		.at('y2', personH);

	COLORS.reverse();

	steps.forEach((d, i) => {
		const percent = d3.format('.1%')(d);
		gradientI
			.append('stop')
			.at('class', 'start')
			.at('offset', percent)
			.at('stop-color', COLORS[i])
			.at('stop-opacity', 1);
	});

	const $defsO = $section.append('svg#gradient--outer').append('defs');
	const gradientO = $defsO
		.append('linearGradient')
		.at('id', 'linear-gradient--outer')
		.at('gradientUnits', 'userSpaceOnUse')
		.at('x1', '0%')
		.at('x2', '0%')
		.at('y1', '0%')
		.at('y2', personH);

	steps.forEach((d, i) => {
		const percent = d3.format('.1%')(d);
		gradientO
			.append('stop')
			.at('class', 'start')
			.at('offset', percent)
			.at('stop-color', () => {
				const c = d3.color(COLORS[i]);
				const diff = c.brighter(0.75);
				return diff.toString();
			})
			.at('stop-opacity', 1);
	});
}

function setupAxis() {
	// just make one around Cardi B
	const axisX = d3
		.axisBottom(scale.snakeX)
		.tickSize(-personH)
		.tickPadding(8)
		.tickFormat((val, i) => {
			let suffix = '';
			if (val === 30) suffix = ' months';
			return `${val}${suffix}`;
		});
	const axisY = d3
		.axisLeft(scale.snakeY)
		.tickSize(-personW)
		.tickPadding(8)
		.tickFormat((val, i) => {
			const suffix = i === 8 ? '+ views/day' : '';
			return `${d3.format(',')(LEVELS[i])}${suffix}`;
		});

	const $axis = $person.select('.g-axis');
	$axis.append('g.axis--x').call(axisX);
	$axis.append('g.axis--y').call(axisY);

	const $cardi = $person.filter(d => d.article === 'Cardi_B');
	const numTicksX = $cardi.selectAll('.axis--x .tick text').size() - 2;
	const numTicksY = $cardi.selectAll('.axis--y .tick text').size() - 2;

	$axis
		.select('.axis--x')
		.selectAll('.tick text')
		.at('text-anchor', (d, i) => (i === numTicksX ? 'start' : 'middle'))
		.at('x', (d, i) => (i === numTicksX ? -8 : 0));

	$axis
		.select('.axis--y')
		.selectAll('.tick text')
		.at('x', (d, i) => (i === numTicksY ? 68 : -12));
}

function setupLegend() {
	const $li = $legend
		.selectAll('li')
		.data(COLORS)
		.enter()
		.append('li');
	$li.st('background-color', d => d);
}

function handleMode() {
	const mode = d3.select(this).at('data-mode');

	if (window.scrollY === 0) window.scrollTo(0, 1);
	$begin.classed('is-hidden', true);
	Audio.play({ t: tracks[0], cb: handleAudioProgress });
	Audio.playBg('Cardi_B');
	tracker.send({ category: 'mode', action: mode, once: true });
	if (mode !== 'text') {
		Audio.toggle(true);
		$subtitles.classed('is-disabled', true);
		$optSub.text('show subtitles');
		$optMute.text('mute');
	}

	if (mobile) window.scrollTo(0, $intro.node().offsetHeight + 1);
}

function setupMode() {
	tracker.send({ category: 'mode', action: 'load', once: true });
	$begin
		.selectAll('.btn')
		.on('click', handleMode)
		.classed('is-hidden', false);
}

function handleMuteClick() {
	const $el = d3.select(this);
	let text = $el.text();
	Audio.toggle(text !== 'mute');
	text = text === 'mute' ? 'unmute' : 'mute';
	$el.text(text);
}

function handleSubClick() {
	const $el = d3.select(this);
	let text = $el.text();
	$subtitles.classed('is-disabled', text !== 'show subtitles');
	text = text === 'show subtitles' ? 'hide subtitles' : 'show subtitles';
	$el.text(text);
}

function setupOptions() {
	$optMute.on('click', handleMuteClick);
	$optSub.on('click', handleSubClick);
}

function loadData() {
	d3.loadData(
		'assets/data/people-info.csv',
		'assets/data/people-svg.json',
		'assets/data/people-monthly.csv',
		(err, response) => {
			if (err) console.log(err);
			else {
				Audio.init(
					response[0],
					tracks,
					annotations,
					handleAudioProgress,
					handleAudioEnd,
					mobile
				);
				joinedData = joinData(response);
				renderPerson(joinedData);
				if (!mobile) renderNametag(joinedData);
				if (!mobile) renderTracks();
				if (mobile) renderAnnotations();
				setupAxis();
				resize();
				if (!mobile) setupScroll();
				if (!mobile) updateScroll();
				$section.classed('is-visible', true);
				preloadImages(joinedData);
			}
		}
	);
}

function init() {
	updateDimensions();
	resize();
	setupGradient();
	setupOptions();
	loadData();
	resize();
}

export default { init, resize };
