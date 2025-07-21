#!/usr/bin/env node

import { dirname, join } from "node:path";
import { ArgumentParser } from "argparse";
import { cwd } from "node:process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const  parser = new ArgumentParser({
    description: "My HTML thingy"
});
parser.add_argument('-y', '--yes', {
    help:'accept all the defaults',
    action: "store_const",
    default: "false",
    const: "true",
});
const args = parser.parse_args();
const USE_DEFAULTS = args.yes=="true";

const CWD = cwd();

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

/**
 * @returns {Promise<String>}
 */
async function getInput(prompt) {
    return new Promise(res=>{
        rl.question(prompt, val=>{
            rl.close();
            res(val);
        });
    });
}

async function main() {
    const present_files = readdirSync(CWD).filter(name=>!name.startsWith('.'));
    if (present_files.length > 0) {
        const ignore = (await getInput('Directory is not empty. Continue? [y/N]')).toLowerCase();
        if (!(ignore=="y" || ignore=="yes")) return;
    }

    ['components', 'src'].forEach(e=>{
        if (!existsSync(e)) {
            mkdirSync(join(CWD, e));
        }
    });

    copyFileSync(
        join(__dirname, 'Element.xsd'),
        join(CWD, 'components', 'Element.xsd')
    );
}

main();
