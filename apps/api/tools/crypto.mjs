import { exec } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

console.log('');
console.log('Add this to your .env:');
console.log(`PII_SIGNING_KEY=${crypto.randomBytes(64).toString('base64')}`);
console.log(`PII_SIGNING_OFFSET=${crypto.randomBytes(8).toString('hex')}`);

if(!fs.existsSync('ssl')) {
	fs.mkdirSync('ssl');
}

let keyName = Date.now() + '-' + Math.floor(Math.random() * 5000);
await execAsync(`openssl genrsa -out ssl/${keyName}.pem 2048`)
	.catch(err => {
		console.log(err);
	});

await execAsync(`openssl rsa -in ssl/${keyName}.pem -outform PEM -pubout -out ssl/${keyName}-public.pem`)
	.catch(err => {
		console.log(err);
	});

console.log(`PRIVATE_KEY="${fs.readFileSync(`ssl/${keyName}.pem`, 'utf-8').replace(/\n/g, '\\n')}"`);
console.log(`PUBLIC_KEY="${fs.readFileSync(`ssl/${keyName}-public.pem`, 'utf-8').replace(/\n/g, '\\n')}"`);

async function execAsync(cmd) {
	return new Promise((resolve, reject) => {
		exec(cmd, (err, stderr, stdout) => {
			if(err) {
				reject(err);
				return;
			}
			resolve();
		});
	});
}