// Global type declarations for modules that don't have proper types
// This file is included via tsconfig.app.json's include pattern

declare module 'uuid' {
	export function v4(): string;
	export function v1(): string;
	export function v3(
		name: string | ArrayLike<number>,
		namespace: string | ArrayLike<number>,
	): string;
	export function v5(
		name: string | ArrayLike<number>,
		namespace: string | ArrayLike<number>,
	): string;
	export function parse(uuid: string): ArrayLike<number>;
	export function stringify(arr: ArrayLike<number>, offset?: number): string;
	export function validate(uuid: string): boolean;
	export function version(uuid: string): number;
	export const NIL: string;
}

declare module 'express' {
	import { IncomingMessage, ServerResponse } from 'http';

	export interface Request extends IncomingMessage {
		body: any;
		params: any;
		query: any;
		headers: any;
		file?: {
			fieldname: string;
			originalname: string;
			encoding: string;
			mimetype: string;
			size: number;
			destination: string;
			filename: string;
			path: string;
			buffer: Buffer;
		};
	}

	export interface Response extends ServerResponse {
		send(body?: any): Response;
		json(body?: any): Response;
		status(code: number): Response;
	}

	export type NextFunction = (err?: any) => void;

	export interface Application {
		use(...handlers: any[]): Application;
		get(path: string, ...handlers: any[]): Application;
		post(path: string, ...handlers: any[]): Application;
		put(path: string, ...handlers: any[]): Application;
		delete(path: string, ...handlers: any[]): Application;
		listen(port: number, callback?: () => void): any;
	}

	export function Router(): any;
	export default function (): Application;
}
