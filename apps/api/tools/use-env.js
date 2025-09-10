let fs = require('fs');

console.log('Removing .env');
try {
	fs.unlinkSync('.env');
	console.log('Done.');
} catch(err) {
	console.log('Nothing to remove.');
}

if(process.argv[2] === 'local') {
	console.log('Attempting to install .env.local to .env');
	try {
		fs.copyFileSync('.env.local', '.env');
		console.log('Done.');
	} catch(err) {
		console.log('File not found. Make sure you have a .env.local file in the project root.');
	}
} else if(process.argv[2] === 'dev') {
	console.log('Attempting to install .env.dev to .env');
	try {
		fs.copyFileSync('.env.dev', '.env');
		console.log('Done.');
	} catch(err) {
		console.log('File not found. Make sure you have a .env.dev file in the project root.');
	}
} else if(process.argv[2] === 'prod') {
	console.log('Attempting to install .env.prod to .env');
	try {
		fs.copyFileSync('.env.prod', '.env');
		console.log('Done.');
	} catch(err) {
		console.log('File not found. Make sure you have a .env.prod file in the project root.');
	}
} else {
	console.log(`Invalid parameter: ${process.argv[2]}`);
}