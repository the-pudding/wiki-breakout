/* global d3 */
import Audio from './audio';
import loadImage from './utils/load-image';
import tracks from './tracks.json'

let ticking = false;
let mobile = false;
let width = 0;
let height = 0;
let marginX = 0;
let marginY = 0;
let personW = 0;
let personH = 0;
let windowH = 0;
let halfH = 0;
let personElH = 0;
let joinedData = [];

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
	gridY: d3.scaleLinear()
};

const $section = d3.select('#graphic');
const $svg = $section.select('.graphic__svg');
const $info = $section.select('.graphic__info');
const $vis = $svg.select('.g-vis');
const $axis = $svg.select('.g-axis');

const imageSet = new Set();

let personElements = [];
let trackElements = [];

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

function handlePersonEnter({ article }) {
	$vis.select(`[data-article="${article}"]`).st({ opacity: 1 });
}

function handlePersonExit({ article }) {
	$vis.select(`[data-article="${article}"]`).st({ opacity: 0.1 });
}

function translatePerson(d) {
	return [scale.gridX(d.svg.x) - marginX, scale.gridY(d.svg.y) - marginY];
}

function renderTracks() {
	const $trackEnter = $info
		.select('.info__track')
		.selectAll('.track')
		.data(tracks)
		.enter()
		.append('div.track');
	$trackEnter.append('p').text(d => d.id);

	
	$trackEnter.each((d, i, n) => {
		tracks[i].el = n[i]
	})
}

function renderInfo(data) {
	const $person = $info
		.select('.info__person')
		.selectAll('.person')
		.data(data, d => d.article);

	const $personEnter = $person.enter().append('div.person');

	$personEnter.at('data-article', d => d.article);

	$personEnter.append('p.name').text(d => d.display);
	$personEnter
		.append('div.thumbnail')
		.st('border-color', d => {
			const l = +d.monthly[d.monthly.length - 3].level;
			if (l >= 6) return 'black';
			return 'red';
		})
		.st('background-image', d => `url(${d.thumbnail_source})`);

	$personEnter
		.on('mouseenter', handlePersonEnter)
		.on('mouseleave', handlePersonExit);

	personElements = $personEnter.nodes();
	personElH = personElements[0].offsetHeight;
}

function renderPerson(data) {
	const $person = $vis.selectAll('.person').data(data, d => d.article);

	const $personEnter = $person.enter().append('g.person');

	$personEnter.at('data-article', d => d.article);

	$personEnter.append('path.snake--outer').at('d', d => d.svg.outer);
	$personEnter.append('path.snake--inner').at('d', d => d.svg.inner);

	$personEnter.append('path.spine').at('d', d => d.svg.spine);
	$personEnter.translate(translatePerson);

	const $personMerge = $personEnter.merge($person);

	$personMerge.order();
	$personMerge
		.select('.snake--inner')
		.st('fill', 'url(#linear-gradient--inner)');
	$personMerge
		.select('.snake--outer')
		.st('stroke', 'url(#linear-gradient--outer)');
}

function updateDimensions() {
	personW = 256;
	personH = 192;
	marginX = personW / 2;
	marginY = personH / 2;
	windowH = window.innerHeight;
	halfH = Math.floor(windowH / 2) - personElH / 2;
	width = $section.node().offsetWidth - marginX * 2;
	height = windowH * 9 - marginY * 2;
	mobile = width < BP;
}

function resize() {
	updateDimensions();
	const w = width + marginX * 2;
	const h = height + marginY * 2;

	$svg.at({ width: w, height: h });
	$info.st({ width, height, top: marginY, left: marginX });

	$vis.translate([marginX, marginY]);
	scale.gridX.range([marginX, width - marginX]);
	scale.gridY.range([marginY, height - marginY]);

	$vis.selectAll('.person').translate(translatePerson);
	$info.selectAll('.person').each((d, i, n) => {
		const [x, y] = translatePerson(d);
		const $el = d3.select(n[i]);
		$el.st('top', y + d.svg.start_y).st('left', x);
		$el.select('.name').st('max-width', marginX * 2);
	});

	$info.selectAll('.track').each((d, i, n) => {
		const $el = d3.select(n[i]);
		const x = -marginX;
		const y = scale.gridY(d.trigger) - marginY;
		$el.st('top', y).st('left', x);
	});

	scale.snakeX.range([0, personW]);
	scale.snakeY.range([personH, 0]);

	if (joinedData.length) {
		const cardi = joinedData.find(d => d.article === 'Cardi_B');
		const [cX, cY] = translatePerson(cardi);
		$axis.translate([cX + marginX, cY + marginY]);
		$axis.select('.axis--x').translate([0, personH]);
		// $axis.select('.axis--y').translate([personW, 0]);
	}
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
			svg: {
				...d.svg,
				start_y: +d.svg.start_y,
				x: +d.svg.x,
				y: +d.svg.y
			}
		}));
	joined.sort((a, b) => d3.descending(a.svg.y, b.svg.y));
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
	$vis.selectAll('.person').each(injectData);
}

// lifted from enter-view
function updateScroll() {
	ticking = false;

	personElements.forEach(el => {
		const { top } = el.getBoundingClientRect();
		const fromMid = top - halfH;
		const percent = 1 - Math.max(0, Math.abs(fromMid) / halfH);

		const opacity = percent > 0.8 ? 1 : percent * percent;

		const $el = d3.select(el);
		$el.st({ opacity });
		if (opacity === 1) $el.raise();
	});


	tracks.forEach(t => {
		const { top } = t.el.getBoundingClientRect();
		const fromMid = top - halfH;
		t.prevMid = t.curMid;
		t.curMid = fromMid;
	});
	
	const filteredTracks = tracks.filter(t => t.prevMid * t.curMid <= 0)
	filteredTracks.sort((a, b) => d3.descending(Math.abs(a.curMid), Math.abs(b.curMid)))
	const trackToPlay = filteredTracks.pop();
	if (trackToPlay) Audio.play(trackToPlay)
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
				const dark = c.darker(0.33);
				return dark.toString();
			})
			.at('stop-opacity', 1);
	});
}

function setupAxis() {
	// just make one around Cardi B
	const axisX = d3.axisBottom(scale.snakeX).tickSize(-personH);
	const axisY = d3.axisLeft(scale.snakeY).tickSize(-personW);
	$axis.append('g.axis--x').call(axisX);
	$axis.append('g.axis--y').call(axisY);
}

function init() {
	preBindData();
	updateDimensions();
	resize();
	setupGradient();

	d3.loadData(
		'assets/data/people-info.csv',
		'assets/data/people-svg.json',
		'assets/data/people-monthly.csv',
		(err, response) => {
			if (err) console.log(err);
			else {
				Audio.init();
				joinedData = joinData(response);
				renderPerson(joinedData);
				renderInfo(joinedData);
				renderTracks();
				setupAxis();
				resize();
				setupScroll();
				updateScroll();
				// TODO improve
				// preloadImages(joinedData);
			}
		}
	);
}

export default { init, resize };
