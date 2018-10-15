const gulp = require('gulp');
const archieml = require('archieml');
const request = require('request');
const fs = require('fs');

const configPath = `${process.cwd()}/config.json`;
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const makeRequest = (google, cb) => {
	const { id, filename } = google;
	const url = `https://docs.google.com/document/d/${id}/export?format=txt`;

	request(url, (error, response, body) => {
		const parsed = archieml.load(body);
		const str = JSON.stringify(parsed);
		const basePath = `${process.cwd()}`;
		const file = `${basePath}/${filename || 'copy'}.json`;
		fs.writeFile(file, str, err => {
			if (err) console.error(err);
			cb();
		});
	});
};

gulp.task('fetch-google', cb => {
	if (config.google.id) makeRequest(config.google, cb);
	else {
		console.error('No google doc');
		cb();
	}
});

gulp.task('fetch-tracks', cb => {
	if (config.google2.id) makeRequest(config.google2, cb);
	else {
		console.error('No google doc');
		cb();
	}
});
