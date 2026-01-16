#!/usr/bin/env node
import fs from 'fs';
import { createInterface } from 'readline';

/**
 * Sync .env file variables to Heroku config vars
 * 
 * Usage:
 *   node sync-env-to-heroku.mjs <env-file-path> <heroku-app-name>
 * 
 * Example:
 *   node sync-env-to-heroku.mjs .env.production vyc-video-builder-api-prod
 * 
 * Requires:
 *   - HEROKU_API_KEY environment variable set
 *   - Or authenticated via Heroku CLI
 */

// ANSI color codes for terminal output
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	cyan: '\x1b[36m',
};

/**
 * Parse .env file and extract uncommented key-value pairs
 */
function parseEnvFile(filePath) {
	if (!fs.existsSync(filePath)) {
		throw new Error(`File not found: ${filePath}`);
	}

	const content = fs.readFileSync(filePath, 'utf-8');
	const lines = content.split('\n');
	const configVars = {};

	for (let line of lines) {
		// Skip empty lines and comments
		line = line.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}

		// Parse KEY=VALUE format
		const match = line.match(/^([^=]+)=(.*)$/);
		if (match) {
			const key = match[1].trim();
			const value = match[2].trim();

			// Preserve quotes and escaped newlines as-is for Heroku
			// Heroku expects values like: "-----BEGIN RSA PRIVATE KEY-----\n..."
			configVars[key] = value;
		}
	}

	return configVars;
}

/**
 * Get Heroku API key from environment or CLI
 */
async function getHerokuApiKey() {
	// Check environment variable first
	if (process.env.HEROKU_API_KEY) {
		return process.env.HEROKU_API_KEY;
	}

	// Try to get from Heroku CLI
	const { exec } = await import('child_process');
	return new Promise((resolve, reject) => {
		exec('heroku auth:token', (error, stdout, stderr) => {
			if (error) {
				reject(new Error('HEROKU_API_KEY not set and heroku CLI not authenticated. Run: heroku login'));
				return;
			}
			resolve(stdout.trim());
		});
	});
}

/**
 * Update Heroku config vars via API
 */
async function updateHerokuConfigVars(appName, configVars, apiKey) {
	const url = `https://api.heroku.com/apps/${appName}/config-vars`;

	const response = await fetch(url, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/vnd.heroku+json; version=3',
			'Authorization': `Bearer ${apiKey}`,
		},
		body: JSON.stringify(configVars),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Heroku API error (${response.status}): ${errorText}`);
	}

	return await response.json();
}

/**
 * Prompt user for confirmation
 */
function promptConfirmation(message) {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(`${colors.yellow}${message} (yes/no): ${colors.reset}`, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
		});
	});
}

/**
 * Main execution
 */
async function main() {
	console.log(`${colors.bright}${colors.cyan}Heroku Config Sync Tool${colors.reset}\n`);

	// Parse command line arguments
	const args = process.argv.slice(2);
	if (args.length !== 2) {
		console.error(`${colors.red}Usage: node sync-env-to-heroku.mjs <env-file-path> <heroku-app-name>${colors.reset}`);
		console.error(`${colors.yellow}Example: node sync-env-to-heroku.mjs .env.production vyc-video-builder-api-prod${colors.reset}`);
		process.exit(1);
	}

	const [envFilePath, appName] = args;

	try {
		// Parse .env file
		console.log(`${colors.cyan}Parsing ${envFilePath}...${colors.reset}`);
		const configVars = parseEnvFile(envFilePath);
		const varCount = Object.keys(configVars).length;

		if (varCount === 0) {
			console.log(`${colors.yellow}No config vars found in ${envFilePath}${colors.reset}`);
			process.exit(0);
		}

		console.log(`${colors.green}Found ${varCount} config variable(s)${colors.reset}\n`);

		// Display variables to be set
		console.log(`${colors.bright}Variables to be set on ${appName}:${colors.reset}`);
		for (const [key, value] of Object.entries(configVars)) {
			// Truncate long values for display
			const displayValue = value.length > 60
				? value.substring(0, 60) + '...'
				: value;
			// Mask sensitive-looking values
			const isSensitive = key.toLowerCase().includes('key') ||
				key.toLowerCase().includes('secret') ||
				key.toLowerCase().includes('password') ||
				key.toLowerCase().includes('token') ||
				key.toLowerCase().includes('signing');
			console.log(`  ${colors.cyan}${key}${colors.reset} = ${isSensitive ? '[REDACTED]' : displayValue}`);
		}
		console.log();

		// Get confirmation
		const confirmed = await promptConfirmation(
			`Do you want to update these ${varCount} config vars on ${appName}?`
		);

		if (!confirmed) {
			console.log(`${colors.yellow}Cancelled.${colors.reset}`);
			process.exit(0);
		}

		// Get Heroku API key
		console.log(`\n${colors.cyan}Authenticating with Heroku...${colors.reset}`);
		const apiKey = await getHerokuApiKey();

		// Update config vars
		console.log(`${colors.cyan}Updating config vars on ${appName}...${colors.reset}`);
		await updateHerokuConfigVars(appName, configVars, apiKey);

		console.log(`${colors.green}${colors.bright}✓ Successfully updated ${varCount} config variable(s) on ${appName}${colors.reset}`);
	} catch (error) {
		console.error(`${colors.red}${colors.bright}Error: ${error.message}${colors.reset}`);
		process.exit(1);
	}
}

// Run the script
main().catch((error) => {
	console.error(`${colors.red}Unexpected error: ${error.message}${colors.reset}`);
	process.exit(1);
});
