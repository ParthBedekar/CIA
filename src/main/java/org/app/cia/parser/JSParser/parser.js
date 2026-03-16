const fs = require('fs');
let filePath = process.argv[2];
const code = fs.readFileSync(filePath, 'utf8');

const parser = require('@babel/parser');
const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties'],
    errorRecovery: true
});

const traverse = require('@babel/traverse').default;
const path = require('path');

const result = {
    filename: path.basename(filePath),
    filepath: filePath,
    classes: [],
    methods: [],
    methodCalls: [],
    imports: [],
    inheritance: []
};

traverse(ast, {

    // Named function declarations
    FunctionDeclaration(path) {
        if (path.node.id) result.methods.push(path.node.id.name);
    },

    // Arrow functions and regular functions assigned to variables
    // e.g. const myFunc = () => {} or const myFunc = function() {}
    VariableDeclarator(path) {
        const init = path.node.init;
        if (!init) return;
        if (
            init.type === 'ArrowFunctionExpression' ||
            init.type === 'FunctionExpression'
        ) {
            if (path.node.id && path.node.id.name) {
                result.methods.push(path.node.id.name);
            }
        }
    },

    // Class declarations
    ClassDeclaration(path) {
        if (path.node.id) {
            result.classes.push(path.node.id.name);
            if (path.node.superClass) {
                result.inheritance.push({
                    className: path.node.id.name,
                    extends: path.node.superClass.name || path.node.superClass.property?.name || ''
                });
            }
        }
    },

    // Class expressions e.g. const Foo = class {}
    ClassExpression(path) {
        if (path.node.id) result.classes.push(path.node.id.name);
    },

    // Class methods e.g. execute() {} inside a class
    ClassMethod(path) {
        if (path.node.key && path.node.key.name) {
            result.methods.push(path.node.key.name);
        }
    },

    // Object methods e.g. { execute(interaction) {} }
    ObjectMethod(path) {
        if (path.node.key && path.node.key.name) {
            result.methods.push(path.node.key.name);
        }
    },

    // Object properties that are arrow/function expressions
    // e.g. { execute: (interaction) => {} }
    ObjectProperty(path) {
        const val = path.node.value;
        if (!val) return;
        if (
            val.type === 'ArrowFunctionExpression' ||
            val.type === 'FunctionExpression'
        ) {
            if (path.node.key && path.node.key.name) {
                result.methods.push(path.node.key.name);
            }
        }
    },

    // Import declarations
    ImportDeclaration(path) {
        result.imports.push(path.node.source.value);
    },

    // require() calls — treat as imports
    CallExpression(path) {
        const callee = path.node.callee;
        const args = path.node.arguments;

        // require('something') → treat as import
        if (
            callee.type === 'Identifier' &&
            callee.name === 'require' &&
            args.length > 0 &&
            args[0].type === 'StringLiteral'
        ) {
            result.imports.push(args[0].value);
            return;
        }

        // client.on('eventName', handler) → treat as method named 'on:eventName'
        if (
            callee.type === 'MemberExpression' &&
            callee.property.name === 'on' &&
            args.length > 0 &&
            args[0].type === 'StringLiteral'
        ) {
            result.methods.push(`on:${args[0].value}`);
            return;
        }

        // client.once('eventName', handler) → treat as method named 'once:eventName'
        if (
            callee.type === 'MemberExpression' &&
            callee.property.name === 'once' &&
            args.length > 0 &&
            args[0].type === 'StringLiteral'
        ) {
            result.methods.push(`once:${args[0].value}`);
            return;
        }

        // General method calls — callee.name for direct, callee.property.name for member
        const name = callee.name || callee.property?.name;
        if (name && name !== 'require') {
            result.methodCalls.push(name);
        }
    },

    // module.exports = { ... } — capture exported property names
    AssignmentExpression(path) {
        const left = path.node.left;
        const right = path.node.right;
        if (
            left.type === 'MemberExpression' &&
            left.object.name === 'module' &&
            left.property.name === 'exports' &&
            right.type === 'ObjectExpression'
        ) {
            for (const prop of right.properties) {
                if (prop.key && prop.key.name) {
                    result.methods.push(`export:${prop.key.name}`);
                }
            }
        }
    }

});

// Deduplicate
result.methods     = [...new Set(result.methods)];
result.imports     = [...new Set(result.imports)];
result.methodCalls = [...new Set(result.methodCalls)];
result.classes     = [...new Set(result.classes)];

console.log(JSON.stringify(result));