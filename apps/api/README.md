# API
API to manage authentication and connection to CMS.


|	Project Meta	|				|
|	---				|	----		|
| Built With		|	NestJS ^10.4.x |
| Primary Contact	|	Michael May	|

## Introduction
This project is based on NestJS and TypeORM. See the [nest documentation](https://nestjs.com/) and [typeorm documentation](https://typeorm.io/#/) for more information.

## Setup
- Update `/src/app.config.ts` to match your requirements.
- Run `npm i` to install required modules.
- Create a `.env` file with the following values:
```
LOCALHOST=true
DEBUG=true
```
- PostgreSQL
```
DATABASE_TYPE=postgres
DATABASE_URL=postgres://some:connection@string
DATABASE_SYNCHRONIZE=false | true
```
The DATABASE_SYNCHRONIZE option will automatically match the connected database structure to your .entity.ts files. (WARNING: Disable this for production and plan a migration process with TypeORM unless you really know what you are doing.)
  
- Signing and encryption
```
PRIVATE_KEY="some\nprivate\nkey\n"
PUBLIC_KEY="some\npublic\nkey\n"
PII_SIGNING_KEY=someBase64==
PII_SIGNING_OFFSET=someHexString
```
See [generating-keys](#generating-keys) for more information.

- For S3 support (optional):
```
AWS_S3_REGION=some-aws-region
AWS_S3_ACCESS_KEY_ID=SOMEAWSACCESSKEY
AWS_S3_SECRET_KEY_ID=SOME+AWSSECRET
AWS_S3_BUCKET_NAME=some-bucket-name
```

## Running
To start the application with live-reload for development, run `npm run start:dev`.  
Once the initial compile has completed, the application will be available at: [http://localhost:8001](http://localhost:8001)
  
To start the application for production, run `npm run build` then `npm start:prod` or, together: `npm run build && npm start:prod`.  
In a production environment, like heroku, the build step will run automatically before launching the application.

## Testing
For unit testing, run `npm run test`  
For end to end testing, run `npm run e2e`

For coverage, see `/coverage`.

<h2 id="generating-keys">Generating Keys</h2>

Run `node ./tools/crypto.mjs` in the root directory and copy the resulting environment variables into your `.env` file.