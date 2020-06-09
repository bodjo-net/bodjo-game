import { promisify } from 'util';
import { exec as _exec, execFile as _execFile, ChildProcess, ExecFileOptions } from 'child_process';
import * as fs from 'fs';
import { BaseEncodingOptions } from 'fs';
import * as Path from 'path';

declare global {
	interface Array<T> {
		forEachAsync: (callback: (value: T, index: number, array: Array<T>) => Promise<void>) => Promise<void>;
	}
}
Array.prototype.forEachAsync = async function<T>(callback : (value: T, index: number, array: Array<T>) => Promise<void>) {
	for (let i = 0; i < this.length; ++i)
		await callback(this[i], i, this);
};

export const randomString = function (n : number = 16, q = "1234567890abcdef") : string {
	return Array.from({length: n}, x => q[~~(Math.random() * (q.length-1))]).join('');
}

const DEBUG = true;
// @ts-ignore
export const log = (...args: any[]) => DEBUG ? console.log.apply(console.log, args) : null;
export const logger = (part: string) => ((...args: any[]) => DEBUG ? console.log.apply(console.log, [part].concat(args)) : null);

class BadExitCodeError extends Error {
    constructor(exitCode : number, reason : string) {
        super();
        this.name = "BadExitCodeError";
        this.stack = this.name + ' (' + exitCode + ')\n' + reason + '\n' + this.stack;
    }
}
export const handleProcess = async (process: ChildProcess) : Promise<string> => {
    return new Promise((resolve, reject) => {
		let buffer : string = "";
		if (process.stdout === null)
			return reject(new Error("stdout is null"));
		process.stdout.on("data", (data : Buffer) => buffer += data.toString());
		if (process.stderr === null)
			return reject(new Error("stderr is null"));
		process.stderr.on("data", (data : Buffer) => buffer += data.toString());
		process.on("close", (exitCode : number) => {
			if (exitCode <= 0)
				resolve(buffer);
			else
				reject(new BadExitCodeError(exitCode, buffer));
		});
	});
};
export const exec = (command: string) : Promise<string> => {
    return handleProcess(_exec(command));
};
export type ExecOptions = BaseEncodingOptions & ExecFileOptions;
export const execFile = async (file: string, args: string[], options?: ExecOptions) : Promise<string> => {
    return handleProcess(_execFile(file, args, options));
};

export const ulimit = (limits: any, hard : boolean = true) => 
	Object.keys(limits).map(limit => (
		(hard ? `ulimit -S${limit} ${limits[limit]}; ` : '') +
		`ulimit -${hard ? 'H' : 'S'}${limit} ${limits[limit]}`
	)).join('; ');

export const escapeRegExp = (string : string) : string => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export const apply = (string: string, props : any) : string => {
	for (let key in props)
		string = string.replace(new RegExp('\\{' + escapeRegExp(key) + '\\}', 'g'), props[key]);
	return string;
}
export const putArrayKeys = (obj: any, array: string[], name: string) : any => {
    array.map((element, i) => obj[name + '[' + i + ']'] = element);
    return obj;
}

export const voidify = (promise: Promise<any>) : Promise<void> => {
    return new Promise<void>((resolve, reject) => {
        promise.then(resolve).catch(reject);
    });
}

export class ExternalPromise<T> {
	public promise : Promise<T>;
	public resolve : (value?: T) => void;
	public reject : (reason?: any) => void;
	constructor() {
		this.promise = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}

interface QueueElement {
	promise: ExternalPromise<void>;
	func: () => Promise<void>;
}
export class Queue {
	private queue : QueueElement[] = [];
	public async do(promiseFunc: () => Promise<void>) : Promise<void> {
		let promise = new ExternalPromise<void>();
		this.queue.push(<QueueElement> {
			promise, func: promiseFunc
		});
		if (!this.running)
			this.run();
		return promise.promise;
	}

	private running: boolean;
	private async run() {
		if (this.running || this.queue.length == 0)
			return;
		this.running = true;
		let element = this.queue.shift();
		element.func()
			.then(element.promise.resolve)
			.catch(element.promise.reject)
			.finally(() => {
				if (this.running = (this.queue.length > 0))
					this.run();
			});
	}
};

export const timeout = (s : number = 1) : Promise<void> => 
	new Promise((resolve, reject) => {
		setTimeout(resolve, s * 1000);
	});

const exists = promisify(fs.exists);
export const unlinkDirectoryRecursivily = async (path : fs.PathLike) : Promise<void> => {
	if (exists(path)) {
		await (await promisify(fs.readdir)(path))
		.forEachAsync(async (file: string) => {
			const curPath = Path.join(path.toString(), file);
			if ((await promisify(fs.lstat)(curPath)).isDirectory()) {
				await unlinkDirectoryRecursivily(curPath);
			} else {
				await promisify(fs.unlink)(curPath);
			}
		});
		await promisify(fs.rmdir)(path);
	}
}