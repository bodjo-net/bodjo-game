import {homedir} from 'os';
import * as fs from 'fs';
import {spawn, exec, ChildProcessWithoutNullStreams, ChildProcess, ExecOptions} from 'child_process';
import {promisify} from 'util';

import {randomString, apply, logger, putArrayKeys, timeout, unlinkDirectoryRecursivily} from './utils';
import LanguageManager, {LanguageSettings} from './langs/manager';
import prepareJail from './chroot';

// /// <reference path="./../node-prlimit/index.d.ts" />
// import prlimit, { ResourceLimit, Limit } from 'test-prlimit';

const prlimit = require('test-prlimit');
const passwd = require('passwd');
const cgroups = require('cgroups');

const root = homedir() + '/.bodjo-space/';
if (!fs.existsSync(root))
    fs.mkdirSync(root, {recursive: true});

const log = logger('index.ts');

type ScriptInit = (directory: string, path: string) => Promise<void>;
class Instance {
    private static readonly shell = "/bin/sh";

    private static allInstances : Instance[] = [];

    public id : string;
    public readonly language : LanguageSettings;
    public script : string | ScriptInit;

    public readonly directory : string;
    public scriptPath : string;

    private userid? : number;

    constructor(language: LanguageSettings, script: string | ScriptInit) {
        this.language = language;
        this.script = script;
        this.id = randomString();
        this.directory = root + this.id;
        this.scriptPath = "/script." + this.language.extension;

        Instance.allInstances.push(this);
    }

    public inited : boolean = false;
    public async init() {
        if (this.inited)
            return;

        if (!(await promisify(fs.exists)(this.directory)))
            await promisify(fs.mkdir)(this.directory, {recursive: true});

        await promisify(passwd.add)(this.id, '', {});
        
        let allUsers : Array<any> = await new Promise(resolve => passwd.getAll(resolve));
        let myUsers = allUsers.filter(user => user.username === this.id);
        if (myUsers.length === 0)
            throw new Error("Didn't find user, that I have created just now.");
        this.userid = parseInt(myUsers[0].userId);

        if (typeof this.script === 'string') {
            await promisify(fs.writeFile)(this.directory + this.scriptPath, this.script);
        } else {
            await this.script(this.directory + '/', this.directory + this.scriptPath);
            if (!(await promisify(fs.exists)(this.directory + this.scriptPath)))
                throw new Error("ScriptInit didn't create script in right path (" + this.scriptPath + ")");
        }

        await prepareJail(this.directory, 
            this.language.executables.concat([ Instance.shell, 'ls', 'echo' ]));

        this.inited = true;
    }

    private process? : ChildProcess;
    public running : boolean = false;
    public async run() {
        if (this.running)
            throw new Error("Instance is already run.");

        if (!this.inited)
            await this.init();    
        
        console.log('running process!');
        let command = "ulimit -a; " + apply(this.language.runCommand, 
            putArrayKeys({
                script: this.scriptPath
            }, this.language.executables, 'executables')
        ) + '; echo $?; ulimit -a';

        let fullCommand =   ``+
                            `${Instance.shell} -c '${command.replace(/\'/g, '\'')}'`;
        console.log(fullCommand);
        this.process = exec(fullCommand, <ExecOptions> {
            stdio: ['pipe', 'pipe', 'pipe', 'pipe']//,
            // uid: this.userid
        });
        this.running = true;

        this.process.stdio.map((stdio, i) => {
            if (i < 1 || stdio === null || stdio === undefined) return;
            stdio.on('data', a => global.process.stdout.write(a));
        });

        this.process.on('exit', code => console.error(code));
    }

    private static triedToClear : boolean = false;
    public static async clearAll() {
        if (Instance.triedToClear)
            return;

        log("clearAll()");
        Instance.triedToClear = true;
        for (let instance of Instance.allInstances) {
            try {
                await instance.clear();
            } catch (e) {
                log(e);
            }
        }
    }
    public async clear() {
        log(this.id+".clear()");
        try {
            await unlinkDirectoryRecursivily(this.directory);
            await new Promise(resolve => passwd.del(this.id, resolve));
        } catch (e) {
            log(this.id+": failed to clear. ", e);
        }
    }
}

process.on('beforeExit', Instance.clearAll);

(async function () {
    let languageManager = await LanguageManager.getInstance();
    let instance = new Instance(languageManager.languages.get('js-node')!, 'console.log("trash")');

    try {
        await instance.run();
    } catch (e) {console.error(e)}
})();
