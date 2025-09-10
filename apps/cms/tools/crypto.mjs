import crypto from 'crypto';

console.log('');
console.log('Add this to your .env:');

const keys = new Array(8).fill().map(() => crypto.randomBytes(16).toString('base64'));
console.log(`APP_KEYS=${keys.splice(0, 4).join(',')}`);
console.log(`API_TOKEN_SALT=${keys.splice(0, 1).join('')}`);
console.log(`API_TOKEN_SECRET=${keys.splice(0, 1).join('')}`);
console.log(`TRANSFER_TOKEN_SALT=${keys.splice(0, 1).join('')}`);
console.log(`JWT_SECRET=${keys.splice(0, 1).join('')}`);
console.log('');