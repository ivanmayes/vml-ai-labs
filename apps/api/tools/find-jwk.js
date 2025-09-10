// Handle environment file
const fs = require('fs');
if(fs.existsSync('.env')) {
	require('dotenv').config();
}

const http = require('request-promise-native');

const cognitoPoolId = process.env.AWS_COGNITO_USER_POOL_ID;
const cognitoRegion = process.env.AWS_COGNITO_REGION;

async function getJWK() {
	if(!cognitoPoolId || !cognitoRegion) {
		throw new Error('Missing required .env value for cognitoPoolId or cognitoRegion.');
	}

	const result = await http.get(
		`https://cognito-idp.${cognitoRegion}.amazonaws.com/${cognitoPoolId}/.well-known/jwks.json`
	).catch(err => {
		console.log(err);
		return null;
	});

	if(!result) {
		throw new Error(`Couldn't get jwks.json`);
	}

	console.log('AWS_COGNITO_JWK_JSON=' + Buffer.from(result).toString('base64'));
}

getJWK()
	.then()
	.catch(err => {
		console.log(err);
	});