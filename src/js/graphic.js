/* global d3 */
import 'stickyfilljs';
import Audio from './audio';
import loadImage from './utils/load-image';
import { tracks } from './tracks.json';
import above from './above.json';

// reverse subtitles
tracks.forEach(t => {
	t.subtitles.reverse();
	t.prevMid = 1;
	t.curMid = 1;
	t.start = +t.start;
	t.end = +t.end;
	if (t.tutorial) t.tutorial = t.tutorial.map(v => ({ ...v, time: +v.time }));
});

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

const margin = { top: 0, right: 0, bottom: 0, left: 0 };
const svgMargin = { top: 24, right: 40, bottom: 24, left: 48 };
const BP = 600;
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
const $section = d3.select('#graphic');
const $people = $section.select('.graphic__people');
const $tracks = $section.select('.graphic__tracks');
const $nametag = $section.select('.graphic__nametag');
const $grid = $section.select('.graphic__grid');
const $legend = $section.select('.graphic__legend');

let $person = $people.selectAll('.person'); // empty to start
let $nametagName = $nametag.selectAll('.name');

const imageSet = new Set();

let personElements = [];
let infoElements = [];

function zeroPad(number) {
	return d3.format('02')(number);
}

function preloadImages(data) {
	let i = 0;

	const next = () => {
		const url = data[i].thumbnail_source;
		loadImage(url, err => {
			if (!err) imageSet.add(data[i].article, true);
			i += 1;
			if (i < data.length) next();
		});
	};

	next();
}

function handleMouseMove(d) {
	const $svg = d3.select(this);
	const [x, y] = d3.mouse(this);
	const oX = x - svgMargin.left;
	const i = Math.round(scale.snakeX.invert(oX));
	const len = d.monthly.length - 1;
	const index = Math.min(Math.max(0, i), len);
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
		.at('y', scale.snakeY(4) - y)
		.at('text-anchor', oX < personW / 1.8 ? 'start' : 'end')
		.text(`Daily views: ${d3.format(',')(pageviews_median)}`);

	$tip
		.selectAll('.date')
		.at('x', oX < personW / 1.8 ? 8 : -8)
		.at('y', scale.snakeY(4) - y - 16)
		.at('text-anchor', oX < personW / 1.8 ? 'start' : 'end')
		.text(`${d3.timeFormat('%b %Y')(date)}`);

	$tip.select('line').at({
		x1: 0,
		x2: 0,
		y1: -y,
		y2: personH - y
	});
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
	$people.select(`[data-article="${article}"]`).st('opacity', 1);
	const $p = d3
		.select(this)
		.parent()
		.parent();

	const datum = $p.datum();
	datum.z_index = 1001;

	$p.datum(datum)
		.classed('is-hover', true)
		.at('data-opacity', $p.st('opacity'))
		.st('opacity', 1)
		.st('z-index', d => d.z_index)
		.datum(datum);

	// TODO
}

function handlePersonExit({ article }) {
	$people.select(`[data-article="${article}"]`).st('opacity', 0.1);
	const $p = d3
		.select(this)
		.parent()
		.parent();

	const active = $p.classed('is-active');
	const datum = $p.datum();
	datum.z_index = active ? 1000 : datum.sort_val;

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
	$person = $people.selectAll('.person').data(data, d => d.article);

	const $personEnter = $person.enter().append('div.person');
	const $infoEnter = $personEnter.append('div.info');
	const $svgEnter = $personEnter.append('svg');

	$svgEnter.on('mousemove', handleMouseMove).on('mouseleave', handleMouseLeave);

	$svgEnter.append('g.g-axis');
	const $visEnter = $svgEnter.append('g.g-vis');

	$personEnter.at('data-article', d => d.article).st('z-index', d => d.z_index);

	$infoEnter.append('p.name');
	$infoEnter.append('p.description');

	$infoEnter
		.append('div.thumbnail')
		.on('mouseenter', handlePersonEnter)
		.on('mouseleave', handlePersonExit);

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

	$person.select('.name').text(d => d.display);
	$person.select('.description').text(d => d.category_specific);
	$person
		.select('.thumbnail')
		.st('background-image', d => `url(${d.thumbnail_source})`);
}

function preRenderPerson() {
	const data = Object.keys(above)
		.map(d => above[d])
		.map(d => ({
			article: d.id,
			svg: d
		}));
	renderPerson(data);
}

function updateDimensions() {
	personW = 256;
	personH = 192;
	margin.left = personW * 0.5;
	margin.right = personW * 0.75;
	margin.top = personH * 1.25;
	margin.bottom = personH * 0.25;
	windowH = window.innerHeight;
	halfH = Math.floor(windowH / 2) - infoElH / 2;
	width = $section.node().offsetWidth - margin.left - margin.right;
	height = windowH * 9 - margin.top - margin.bottom;
	mobile = width < BP;
}

function resize() {
	updateDimensions();
	// const w = width + margin.left + margin.right;
	// const h = height + margin.top + margin.bottom;

	$people.st({ width, height, top: margin.top, left: margin.left });
	$tracks.st({ width: margin.left, height, top: margin.top - personH });

	// $vis.translate([margin.left, margin.top]);
	scale.gridX.range([margin.left, width - margin.right]);
	scale.gridY.range([margin.top, height - margin.bottom]);

	$tracks.selectAll('.track').each((d, i, n) => {
		const $el = d3.select(n[i]);
		const top = scale.gridY(d.start) - personH;
		const h = scale.gridY(d.end) - top;

		$el.st({ top, height: h });
	});

	scale.snakeX.range([0, personW]);
	scale.snakeY.range([personH, 0]);

	$person.each((d, i, n) => {
		const [x, y] = translatePerson(d);
		const $p = d3.select(n[i]);
		$p.st('top', y).st('left', x);
		$p.select('.info').st('top', d.svg.start_y + svgMargin.top);

		$p.select('.info .name').st('max-width', margin.left);

		const $svg = $p.select('svg');
		$svg.at({
			width: personW + svgMargin.left + svgMargin.right,
			height: personH + svgMargin.top + svgMargin.bottom
		});
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
	$grid.select('.grid__x').st('padding', '0 32px');
	$grid.select('.grid__y').st('padding', '0 32px');
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
			sort_val: Math.round(+d.svg.y * 1000),
			z_index: Math.round(+d.svg.y * 1000),
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
	const $name = $nametag.select(`[data-article="${article}"`);
	$nametag.selectAll('.name').classed('is-active', false);
	$name.classed('is-active', true);

	const shift = (joinedData.length - currentNametagIndex) * -nameHeight;
	$nametag.st('margin-top', shift + nameHeight * 0.5);
}

function updateInfo(el) {
	const $p = d3.select(el);
	$person.classed('is-active', false);
	$p.classed('is-active', true).raise();
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
				const $tip = $person
					.filter(d => d.article === 'Cardi_B')
					.select('.g-tip');
			}
		}
	});
}

function updateSubtitle({ id, seek }) {
	const { subtitles } = tracks.find(t => t.id === id);
	const match = subtitles.find(s => seek >= s.time);
}

function handleAudioProgress({ id, duration, seek }) {
	scale.time.domain([0, Math.ceil(duration)]);
	const seconds = zeroPad(Math.round(duration - seek));
	$tracks
		.select(`[data-id='${id}'] .timer`)
		.text(`:${seconds}`)
		.st('background-color', scale.time(seconds));

	if (id === 'intro') showTutorial(seek);
	if (seek > 0) updateSubtitle({ id, seek });
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
		$el.st({ opacity });
		// if (opacity === 1) $el.raise();
	});

	const el = personElements[closest.index];
	const $p = d3.select(el);

	if (currentNametagIndex !== closest.index) {
		currentNametagIndex = closest.index;
		updateNametag(el);
		updateInfo(el);
	}

	const datum = $p.datum();
	datum.z_index = 1000;

	d3.select(el)
		.datum(datum)
		.st('opacity', 1)
		.st('z-index', d => d.z_index);

	tracks.forEach(t => {
		const { top } = t.el.getBoundingClientRect();
		const fromMid = top - halfH;
		t.prevMid = t.curMid;
		t.curMid = fromMid;
	});

	const filteredTracks = tracks.filter(t => t.prevMid * t.curMid <= 0);
	filteredTracks.sort((a, b) =>
		d3.descending(Math.abs(a.curMid), Math.abs(b.curMid))
	);
	const trackToPlay = filteredTracks.pop();
	if (trackToPlay) {
		Audio.play({ t: trackToPlay, cb: handleAudioProgress });
		$grid.classed('is-visible', true);
		$legend.classed('is-visible', true);
	}
}

function onScroll() {
	if (!ticking) {
		ticking = true;
		window.requestAnimationFrame(updateScroll);
	}
}

function setupScroll() {
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
			const suffix = val === 35 ? ' months' : '';
			return `${val}${suffix}`;
		});
	const axisY = d3
		.axisLeft(scale.snakeY)
		.tickSize(-personW)
		.tickPadding(8)
		.tickFormat((val, i) => {
			const suffix = i === 8 ? '+ pageviews' : '';
			return `${d3.format(',')(LEVELS[i])}${suffix}`;
		});
	const cardi = $person.filter(d => d.article === 'Cardi_B');
	const $axis = cardi.select('.g-axis');
	$axis.append('g.axis--x').call(axisX);
	$axis.append('g.axis--y').call(axisY);

	const $tickTextX = $axis.select('.axis--x').selectAll('.tick text');
	const numTicksX = $tickTextX.size() - 1;
	$tickTextX
		.at('text-anchor', (d, i) => (i === numTicksX ? 'start' : 'middle'))
		.at('x', (d, i) => (i === numTicksX ? -8 : 0));

	const $tickTextY = $axis.select('.axis--y').selectAll('.tick text');
	const numTicksY = $tickTextY.size() - 2;
	$tickTextY.at('x', (d, i) => (i === numTicksY ? 80 : 0));
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
}

function setupMode() {
	d3.select('.begin__modes .btn').on('click', handleMode);
}

function loadData() {
	d3.loadData(
		'assets/data/people-info.csv',
		'assets/data/people-svg.json',
		'assets/data/people-monthly.csv',
		(err, response) => {
			if (err) console.log(err);
			else {
				Audio.init(handleAudioProgress);
				joinedData = joinData(response);
				renderPerson(joinedData);
				renderNametag(joinedData);
				renderTracks();
				setupAxis();
				resize();
				setupScroll();
				updateScroll();
				// $main.classed('is-ready', true);
				$section.classed('is-visible', true);
				// TODO improve
				// preloadImages(joinedData);
			}
		}
	);
}

function init() {
	updateDimensions();
	resize();
	setupGradient();
	setupLegend();
	setupMode();
	preRenderPerson();
	loadData();
	resize();
}

export default { init, resize };
