import js from './js';
import {exec, apply, putArrayKeys, log} from '../utils';
import * as fs from 'fs';
import {promisify} from 'util';

const allLanguages = [ js ];

export default class LanguageManager {
    private static instance: LanguageManager = null;
    public static async getInstance() : Promise<LanguageManager> {
        if (LanguageManager.instance === null) {
            LanguageManager.instance = new LanguageManager();
            await LanguageManager.instance.init();
        }
        return LanguageManager.instance;
    }
    private constructor() { /* ... */ }

    public languages: Map<string, LanguageSettings> = new Map<string, LanguageSettings>();

    async init() {
        for (let language of allLanguages) {
            try {
                let ok = true;
                for (let executable of language.executables) {
                    if (!(await promisify(fs.exists)(executable))) {
                        console.error(`Failed to find ${executable} for ${language.id}.`);
                        ok = false;
                        break;
                    }
                }
                if (!ok)
                    continue;
                language.version = await exec(
                    apply(language.versionCommand, putArrayKeys({}, language.executables, 'executables'))
                );
                this.languages.set(language.id, language);
            } catch ([exitCode, reason]) {
                console.error(`Failed to obtain ${language.id} version: (${exitCode}) ${reason}`);
                continue;
            }
        }
    }
}

export type Limits = {
    core?: number;          // limits the core file size (KB)     
    data?: number;          // max data size (KB)
    fsize?: number;         // maximum filesize (KB)
    memlock?: number;       // max locked-in-memory address space (KB)
    nofile?: number;        // max number of open files
    rss?: number;           // max resident set size (KB)
    stack?: number;         // max stack size (KB)
    cpu?: number;           // max CPU time (MIN)
    nproc?: number;         // max number of processes
    as?: number;            // address space limit (KB)
    maxlogins?: number;     // max number of logins for this user
    maxsyslogins?: number;  // max number of logins on the system
    priority?: number;      // the priority to run user process with
    locks?: number;         // max number of file locks the user can hold
    sigpending?: number;    // max number of pending signals
    msgqueue?: number;      // max memory used by POSIX message queues (bytes)
    nice?: number;          // max nice priority allowed to raise to values: [-20, 19]
    rtprio?: number;        // max realtime priority
};
export interface LanguageSettings {
    id: string;
    name: string;
    extension: string;
    executables: string[];

    buildLimits?: Limits;
    buildCommand?: string;
    
    versionCommand: string;
    version?: string;

    runLimits: Limits;
    runCommand: string;
}

