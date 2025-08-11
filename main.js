#!/usr/bin/env node

import { XMLParser } from "fast-xml-parser";
import { parse } from "node-html-parser";
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ArgumentParser } from "argparse";
import { cwd } from "node:process";
import { spawnSync } from "node:child_process";
import { promises as fsPromises } from "fs";
const { readFile, writeFile, readdir, mkdir, lstat, copyFile } = fsPromises;

const  parser = new ArgumentParser({
    description: "My HTML thingy"
});
parser.add_argument('-c', '--components', {default:'components', help:'The name of the components directory'});
parser.add_argument('-o', '--out', {default:'out', help:'The name of the output directory'})
parser.add_argument('-s', '--src', {default:'src', help:'The name of the source directory'})
parser.add_argument('-I', '--indent', {action:'store_const', const:'true', help:'Indents the output files. Requires the vim or nvim commands'})
const args = parser.parse_args();

const COMPS_FOLDER = args.components;
const OUT_FOLDER = args.out;
const SRC_FOLDER = args.src;
const CWD = cwd();
const INDENT = args.indent==='true';

const parserXML = new XMLParser({
    ignoreAttributes:false,
    allowBooleanAttributes:true
});
const parseHTML = parse;

/**
 * @property {String} name - The component's name, used in the tag
 * @property {String[]} parameters - The component's parameters
 * @property {String} template - The template with the symbolic parameters inside
 */
class Component {
    /**
     * @param {String} file_path - The path to the Component file
     */
    constructor(file_path) {
        const file_contents = readFileSync(file_path);
        const XMLdata = parserXML.parse(file_contents).Element;

        /** @type {String} */
        this.name = XMLdata.Name;
        /** @type {String[]} */
        this.parameters = XMLdata.Parameter;
        if (!this.parameters) this.parameters = [];
        /** @type {String} */
        this.template = file_contents.toString().match(/<Template>(?<template>[\s\S]*)<\/Template>/).groups.template.trim();
    }
}

/** @type {Map<String, Component>} */
const components = new Map();
/** @type {Set<String>} */
const component_names = new Set();
/** @type {Set<String>} */
const parameter_names = new Set();

function leggi_componenti() {
    for (let file_name of readdirSync(join(CWD, COMPS_FOLDER))) {
        if (!file_name.endsWith('.xml')) continue;
        const file_path = join(CWD, COMPS_FOLDER, file_name)

        const component = new Component(file_path);
        console.log(`Creating component ${component.name}`);

        components.set(component.name, component);
        component_names.add(component.name)
        for (let parameter of component.parameters) {
            parameter_names.add(parameter);
        }
    }
}

/**
 * @param {String} name
 * @param {object} params
 * @returns {String} 
 */
function populate_template(name, params) {
    const component = components.get(name)

    /** @type {String} */
    let ret_string = component.template;
    for (let param_name of component.parameters) {
        ret_string = ret_string.replaceAll(`<${param_name}/>`, params[param_name]);
    }

    return ret_string
}

function convert_string(content) {
    const html_data = parseHTML(content);

    const stack = [];
    for (let child of html_data.childNodes) {
        stack.push({
            node: child,
            visited: false,
        });
    }

    while (stack.length>0) {
        const top = stack[stack.length-1];

        // Simula post-order mantenendo una
        if (!top.visited) {
            for (let child of top.node.childNodes) {
                stack.push({
                    node: child,
                    visited: false
                });
            }
            top.visited = true;
            continue;
        }

        const corrente = stack.pop().node;

        if (component_names.has(corrente.rawTagName)) {
            // substitute
            const element_name = corrente.rawTagName;
            const actual_params_str = corrente.toString();

            // const actual_para_XML = parserXML.parse(actual_params_str);
            const actual_params = {};

            for (let param_name of components.get(element_name).parameters) {
                actual_params[param_name] = actual_params_str.match(
                    new RegExp(`<${param_name}>([\\S\\s]*)<\/${param_name}>`)
                )[1];
            }

            const new_elem = parseHTML(
                populate_template(
                    element_name, 
                    actual_params
                )
            );

            corrente.replaceWith(new_elem);
        }
    }

    return html_data.toString();
}

async function convert_file(file_path) {
    const fullPath = join(CWD, SRC_FOLDER, file_path);
    const outPath = join(CWD, OUT_FOLDER, file_path);

    const content = await readFile(fullPath, 'utf-8');
    const converted = convert_string(content);
    await writeFile(outPath, converted);

    if (INDENT) indent_file(outPath);
}

function restoreSelfClosingTags(html) {
    for (const tag of parameter_names) {
        const pattern = new RegExp(`<${tag}></${tag}>`, 'g');
        html = html.replace(pattern, `<${tag}/>`);
    }
    return html;
}

function unpack_componenti() {
    console.log("unpack");
    let finished;
    let max_recursion_depth = 100;
    do {
        finished = true;
        for (let componente of components.values()) {
            const old_template = componente.template;
            componente.template = restoreSelfClosingTags(convert_string(componente.template)).trim();
            const new_template = componente.template;
            if (new_template!=old_template) finished = false;
        }
        max_recursion_depth--;
    }while (!finished && max_recursion_depth>0);
}

function indent_file(path) {
    let result = spawnSync("vim", ["-c", "norm gg=G", "-c", "wq", "-es", path], {
        stdio: "ignore",
    });

    if (result.error) {
        result = spawnSync("nvim", ["-c", "norm gg=G", "-c", "wq", "-es", path], {
            stdio: "ignore",
        });

        if (result.error) {
            console.log(`Couldn't indent file ${path}`);
        }
    }
}

async function main() {
    leggi_componenti();
    unpack_componenti();
    if (!existsSync(OUT_FOLDER)) mkdirSync(join(CWD, OUT_FOLDER));

    const stack = ['.'];
    const SRC_BASE = join(CWD, SRC_FOLDER);
    const convertTasks = [];

    while (stack.length > 0) {
        const corrente = stack.pop();
        const currentPath = join(SRC_BASE, corrente);
        const children = await readdir(currentPath);

        for (let child of children) {
            if (child.startsWith('.')) continue;

            const fullPath = join(currentPath, child);
            const relativePath = join(corrente, child);
            const stat = await lstat(fullPath);

            if (stat.isDirectory()) {
                stack.push(relativePath);
                const newDir = join(CWD, OUT_FOLDER, relativePath);
                if (!existsSync(newDir)) {
                    await mkdir(newDir);
                }
            } else if (stat.isFile()) {
                if (child.endsWith(".html")) {
                    console.log(`Scheduling ${relativePath}`);
                    convertTasks.push(convert_file(relativePath));
                } else {
                    const outPath = join(CWD, OUT_FOLDER, relativePath);
                    convertTasks.push(copyFile(fullPath, outPath));
                }
            }

        }
    }

    await Promise.allSettled(convertTasks);
    console.log("All conversions completed.");
}

main().catch(console.error);
