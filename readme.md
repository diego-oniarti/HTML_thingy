# complexhtml

A small command-line HTML compiler with a component system. Write reusable HTML components once and compose them in your source pages. `html_compile` expands them into plain HTML output.

## Requirements

- [Node.js](https://nodejs.org/) >= 14

## Installation

```sh
npm install -g .
```

This installs two commands:

- `html_init` — scaffolds a new project in the current directory
- `html_compile` — compiles a `src/` directory into an `out/` directory

To uninstall, run:

```sh
npm uninstall -g .
```

## Getting started

Initialize a new project (safe to run in an empty directory):

```sh
html_init
```

This creates the following directories:

```
components/    Element.XSD and your component definitions (.xml)
src/           your source HTML files
```

### Defining a component

Components are XML files in the `components/` directory that follow the schema in `components/Element.xsd`:

```xml
<Element>
    <Name>greet</Name>
    <Parameter>name</Parameter>
    <Parameter>greeting</Parameter>
    <Template>
        <div>
            <h1><greeting/></h1>
            <p>Hello <name/>!</p>
        </div>
    </Template>
</Element>
```

| Field       | Description                                                                    |
| ---         | ---                                                                            |
| `Name`      | The tag name used in your HTML (`<greet>` here)                                |
| `Parameter` | The names of the parameters the component accepts                              |
| `Template`  | The HTML template, with parameters referenced as self-closing tags (`<name/>`) |

### Using a component

In your source HTML, use the component tag and pass parameters as child elements:

```html
<!DOCTYPE html>
<html>
<body>
    <greet>
        <greeting>Good morning</greeting>
        <name>World</name>
    </greet>
</body>
</html>
```

The matching parameters are substituted into the template. Components can be nested inside other components.

### Compiling

```sh
html_compile
```

This reads every `.html` file in `src/` (recursively), expands the components, and writes the result to `out/`, preserving the directory structure. Non-HTML files are copied over unchanged.

## CLI options

`html_compile` accepts the following options:

| Option                   | Default        | Description                                     |
| ---                      | ---            | ---                                             |
| `-c, --components <dir>` | `components`   | Directory containing your component definitions |
| `-s, --src <dir>`        | `src`          | Source directory to compile                     |
| `-o, --out <dir>`        | `out`          | Output directory for the compiled files         |
| `-I, --no-indent`        | indentation on | Disable output indentation                      |

Output HTML is indented/pretty-printed with Prettier by default. Pass `-I` to write raw, unformatted output instead.

## How it works

1. **Components are loaded** from the `components/` directory and their templates are parsed with `fast-xml-parser`.
2. **`unpack`**: component templates that reference other components are expanded recursively (up to a depth of 100), so components work inside components.
3. **Conversion**: each source file is parsed with `node-html-parser` and walked post-order; every tag matching a component name is replaced by its populated template.
4. **Formatting**: the converted HTML is pretty-printed with Prettier and written to `out/`.
