import { ChildProcess, ExecOptions, exec as _exec, spawn } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import * as fs from 'fs';

import { exec } from './utils';

export default async function prepareJail (directory: string, executables: string[], pass?: Array<[string, string]>) : Promise<void> {
    // lookup for executables' libraries
    let files = [];
    for (let i = 0; i < executables.length; ++i) {
        if (executables[i].trim()[0] !== '/') {
            try {
                executables[i] = (await exec('which ' + executables[i])).trim();
            } catch (err) {
                console.error("Failed to obtain path of " + executables[i]);
                throw err;
            }
        }
        files.push(executables[i]);

        try {
            let ldd = await exec('ldd ' + executables[i]);
            let libs = ldd.match(/\/.*\.\d/g);
            if (libs === null)
                continue;
            files.push.apply(files, libs);
        } catch (e) { /* ignore */ }
    };
    files = files.filter((item, i, arr) => arr.indexOf(item) === i); // unique
    console.log(files);

    await exec('mkdir -p ' + directory.replace(/ /g, '\\ '));

    // copy them into directory
    let promises = [];
    for (let file of files)
        promises.push(exec('cp --parents "' + file.replace(/\"/g, '\\"') + '" "' + directory.replace(/\"/g, '\\"') + '"'));

    // pass other files
    if (pass) {
        for (let [from, to] of pass)
            promises.push(exec(`cp ${from} ${directory}${to}`));
    }

    await Promise.all(promises);
    console.log('copied!');

    // copy locale
    const locale = '/usr/lib/locale';
    await exec('mkdir -p ' + locale);
    await exec('cp -r --parents ' + locale + ' ' + directory);
};

// (async function () {
//     const jailRoot = '/root/.bodjo-space';
//     await prepareJail(jailRoot, ['bash', 'echo', 'ulimit', 'node']);
    
//     console.log("prepared");
//     let process = spawn("unshare", [
//             '-n', 'chroot', '--userspec=89:89', jailRoot, 
//             '/bin/bash', '-c', "'ulimit -t 1; echo hi >&3'"
//     ], {
//         stdio: ['pipe', 'pipe', 'pipe', 'pipe']
//     });
//     process.stdout!.on('data', (msg: Buffer) => console.log(1,msg.toString()));
//     process.stderr!.on('data', (msg: Buffer) => console.log(2,msg.toString()));
//     process.stdio[3].on('data', (msg: Buffer) => console.log(3,msg.toString()));
//     process.on('close', console.log); 

//     console.log('inited');
// })();
