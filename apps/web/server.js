const fs = require('fs');
const path = require('path');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const enforce = require('express-sslify');

// Handle environment file
if (fs.existsSync('.env')) {
	require('dotenv').config();
}

const isLocal = process.env.LOCALHOST || false;
const indexTemplate = fs.readFileSync(path.join(__dirname, '/dist/index.html'), 'utf-8');
let apiMap;

function init() {
	try {
		apiMap = JSON.parse(process.env.API_SETTINGS);
		if(!apiMap) {
			throw new Error('Invalid API_SETTINGS');
		}
	} catch(err) {
		console.error(`Environment not configured. Missing or invalid API_SETTINGS.`);
		process.exitCode = 1;
		return;
	}

	const app = express();

	app.use(compression());
	if (!isLocal) {
		app.use(enforce.HTTPS({ trustProtoHeader: true }));
	}

	// Security header middleware.
	// app.use(helmet());

	app.use((req, res, next) => {
		// Only allow specific CORS requests.
		if (typeof req.headers !== 'undefined' && typeof req.headers.origin !== 'undefined') {
			if (req.headers.origin.indexOf('localhost') !== -1 && req.headers.host.indexOf('localhost') !== -1) {
				res.header('Access-Control-Allow-Origin', req.headers.origin);
			}
		}
		next();
	});

	app.use((req, res, next) => {
		res.header('Access-Control-Allow-Headers', 'X-Requested-With');
		next();
	});

	// Handle static files
	app.use((req, res, next) => {
		if(['/', '/index.html'].includes(req.url)) {
			handleIndex(req, res);
		} else {
			next();
		}
	}, express.static(path.join(__dirname, '/dist'), { fallthrough: true }));

	// Everything else to index
	app.get('*', (req, res) => {
		handleIndex(req, res);
	});

	console.log('Starting server...');
	let server = app.listen(process.env.PORT || 8080, function () {
		let port = server.address().port;
		console.log('Server listening on ' + port);
	});
};

function handleIndex(req, res) {
	const defs = apiMap[req.hostname];
	if(!defs || !defs.length) {
		res.status(500);
		res.send('<h1>Error 500</h1></h2>This server is not configured to satisfy requests from this domain.</h2>');
		return;
	}

	let orgCode = '';
	if(defs.length === 1) {
		orgCode = `
			var exclusive = true;
			var apiUrl = '${defs[0].endpoint}';
			var organizationId = '${defs[0].organizationId}';
			var production = ${defs[0].production};
			var locale = '${defs[0].locale || 'en-US' }';
			var wppOpenParentOrigin = '${defs[0].wppOpenParentOrigin || ''}';
			var wppOpenDebug = ${defs[0].wppOpenDebug || false};
		`;
	} else {
		orgCode = `
			var exclusive = false;
			var organizations = JSON.parse('${JSON.stringify(defs)}');
		`;
	}

	res.send(indexTemplate.replace(/\/\*##API_SETTINGS##\*\//g, orgCode));
}

init();
