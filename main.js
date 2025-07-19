#!/usr/bin/env node

import { XMLParser } from "fast-xml-parser";
import { parse } from "node-html-parser";
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, lstatSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { ArgumentParser } from "argparse";
import { cwd } from "node:process";

const  parser = new ArgumentParser({
    description: "My HTML thingy"
});
parser.add_argument('-c', '--components', {default:'Components', help:'The name of the components directory'});
parser.add_argument('-o', '--out', {default:'out', help:'The name of the output directory'})
parser.add_argument('-s', '--src', {default:'src', help:'The name of the source directory'})
const args = parser.parse_args();

const COMPS_FOLDER = args.components;
const OUT_FOLDER = args.out;
const SRC_FOLDER = args.src;
const CWD = cwd();

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

        this.name = XMLdata.Name;
        this.parameters = XMLdata.Parameter;
        this.template = file_contents.toString().match(/<Template>(?<template>[\s\S]*)<\/Template>/).groups.template;
    }
}

/** @type {Map<String, Component>} */
const components = new Map();
/** @type {Set<String>} */
const component_names = new Set();

function leggi_componenti() {
    for (let file_name of readdirSync(join(CWD, COMPS_FOLDER))) {
        const file_path = join(CWD, COMPS_FOLDER, file_name)

        const component = new Component(file_path);
        console.log(`Created component ${component.name}`);

        components.set(component.name, component);
        component_names.add(component.name)
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

function convert_file(file_path) {
    const html_data = parseHTML(readFileSync(join(CWD, SRC_FOLDER, file_path)));

    const stack = [html_data.childNodes[0]];
    const stack_reverse = [];
    while (stack.length>0) {
        const corrente = stack.pop();
        stack_reverse.push(corrente);
        for (let child of corrente.childNodes) {
            stack.push(child);
        }
    }
    while (stack_reverse.length>0) {
        const corrente = stack_reverse.pop();
        if (component_names.has(corrente.rawTagName)) {
            // substitute
            const element_name = corrente.rawTagName;
            const actual_params_str = corrente.toString();

            // const actual_para_XML = parserXML.parse(actual_params_str);
            const actual_params = {};
            for (let param_name of components.get(element_name).parameters) {
                actual_params[param_name] = actual_params_str.match(new RegExp(`<${param_name}>([\\S\\s]*)<\/${param_name}>`))[1];
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

    writeFileSync(join(CWD, OUT_FOLDER, file_path), html_data.toString());
}

function main() {
    leggi_componenti();
    if (!existsSync(OUT_FOLDER)) mkdirSync(join(CWD, OUT_FOLDER))

    const stack = ['.'];
    const SRC_BASE = join(CWD, SRC_FOLDER);
    while (stack.length>0) {
        const corrente = stack.pop();

        for (let child_name of readdirSync(join(SRC_BASE, corrente))) {
            const full_child_path = join(SRC_BASE, corrente, child_name)
            const relative_child_path = join(corrente, child_name);

            const lstat = lstatSync(full_child_path);

            if (lstat.isDirectory()) {
                stack.push(relative_child_path);
                const newDir = join(CWD, OUT_FOLDER, relative_child_path);
                if (!existsSync(newDir)) {
                    mkdirSync(newDir);
                }
            }

            if (lstat.isFile()) {
                if (child_name.endsWith(".html")) {
                    convert_file(join(relative_child_path));
                }else{
                    copyFileSync(
                        full_child_path,
                        join(CWD, OUT_FOLDER, relative_child_path)
                    );
                }
            }

        }
    }

}

main();
