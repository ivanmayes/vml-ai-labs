const fs = require('fs');
const dotenv = require('dotenv');
if(fs.existsSync('.env')) {
	dotenv.config();
}

if(fs.existsSync('ormconfig.ts')) {
	fs.unlinkSync('ormconfig.ts');
}

let config = `
import path from 'path';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
	type: 'postgres',
	url: '${process.env.DATABASE_URL}',
	extra: {
		ssl: ${(process.env.DATABASE_SSL) ? '{ rejectUnauthorized: false }' : false},
	},
	migrationsTableName: 'migrations',
	migrations: [path.resolve(__dirname + '/migrations/*.ts')],
	synchronize: false,
	logging: false,
	entities: [path.resolve(__dirname + '/src/**/*.entity.ts')],
	subscribers: [],
});
`;
fs.writeFileSync('ormconfig.ts', config, 'utf-8');