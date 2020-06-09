import { LanguageSettings } from './manager';

export default <LanguageSettings> {
    id: "js-node",
    name: "JavaScript (Node.JS)",
    extension: "js",

    executables: ['/usr/local/bin/node'],

    runLimits: {
        cpu: 1
    },
    runCommand: "{executables[0]} {script}",

    versionCommand: "{executables[0]} -v"
};