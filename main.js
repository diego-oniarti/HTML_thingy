#!/usr/bin/env Node

const {XMLParser} = require("fast-xml-parser");
const {parse} = require("node-html-parser");
const fs = require("node:fs")
const path = require("node:path")
const { ArgumentParser } = require("argparse");
const process = require("node:process");

const  parser = new ArgumentParser({
    description: "My HTML thingy"
});
parser.add_argument('-c', '--components', {default:'Components', help:'The name of the components directory'});
parser.add_argument('-o', '--out', {default:'out', help:'The name of the output directory'})
const args = parser.parse_args();

const COMPS_FOLDER = args.components;
const OUT_FOLDER = args.out;
const CWD = process.cwd();

const options = {
    ignoreAttributes:false,
    allowBooleanAttributes:true
};
const parserXML = new XMLParser(options);
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
        const file_contents = fs.readFileSync(file_path);
        const XMLdata = parserXML.parse(file_contents).Element;

        this.name = XMLdata.Name;
        this.parameters = XMLdata.Parameter;
        this.template = file_contents.toString().match(/<Template>(?<template>[\s\S]*)<\/Template>/).groups.template;
    }
}

/** @type {Map<String,Component>} */
const components = new Map();
/** @type {String[]} */
const component_names = [];

function leggi_componenti() {
    for (let file_name of fs.readdirSync(path.join(CWD, COMPS_FOLDER))) {
        const file_path = path.join(CWD, COMPS_FOLDER, file_name)

        const component = new Component(file_path);
        console.log(`Created component ${component.name}`);

        components.set(component.name, component);
        component_names.push(component.name)
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
    // faccio l'index ora poi farò tutta una cartella 
    const html_data = parseHTML(fs.readFileSync(path.join(CWD, file_path)));

    /** @type {HTMLElement[]} */
    const stack = [html_data.childNodes[0]];
    while (stack.length>0) {
        const corrente = stack.pop();
        if (component_names.includes(corrente.rawTagName)) {
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
            stack.push(new_elem);
        }else{
            for (let child of corrente.childNodes) {
                stack.push(child)
            }
        }
    }

    fs.writeFileSync(path.join(CWD, OUT_FOLDER, file_path), html_data.toString());
}

function main() {
    leggi_componenti();
    if (!fs.existsSync(OUT_FOLDER)) fs.mkdirSync(path.join(CWD,OUT_FOLDER))

    const full_components_path = path.join(CWD,COMPS_FOLDER);
    const full_out_path = path.join(CWD,OUT_FOLDER);

    const stack = ['.'];
    while (stack.length>0) {
        const corrente = stack.pop();

        for (let child_name of fs.readdirSync(path.join(CWD, corrente))) {
            const full_child_path = path.join(CWD,corrente,child_name)
            const relative_child_path = path.join(corrente,child_name);

            if (full_child_path==full_components_path || full_child_path==full_out_path) continue;

            const lstat = fs.lstatSync(full_child_path);

            if (lstat.isDirectory()) {
                stack.push(relative_child_path);
                fs.mkdirSync(path.join(CWD,OUT_FOLDER,corrente,child_name));
            }

            if (lstat.isFile()) {
                if (child_name.endsWith(".html")) {
                    convert_file(relative_child_path)
                }else{
                    fs.copyFileSync(
                        full_child_path,
                        path.join(CWD,OUT_FOLDER,corrente,child_name)
                    );
                }
            }

        }
    }

}

main();
