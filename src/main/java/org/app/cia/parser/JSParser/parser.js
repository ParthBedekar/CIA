const fs=require('fs');
let filePath=process.argv[2];
const code= fs.readFileSync(filePath,'utf8');

const parser=require('@babel/parser')

const ast=parser.parse(code,{sourceType: 'module', plugins: ['jsx', 'classProperties']})

const traverse = require('@babel/traverse').default;

const path=require('path');

const result = {
    filename: path.basename(filePath),
    filepath:filePath,
    classes: [],
    methods: [],
    methodCalls: [],
    imports: [],
    inheritance: []
};

traverse(ast,{
    ClassDeclaration(path){
        result.classes.push(path.node.id.name);

        if(path.node.superClass){
            result.inheritance.push({
                className: path.node.id.name,
                extends: path.node.superClass.name
            });
        }
    },
    ClassExpression(path) {
        if(path.node.id!=null){
            result.classes.push(path.node.id.name);
        }
    },
    FunctionDeclaration(path) {
        result.methods.push(path.node.id.name);
    },
    ImportDeclaration(path) {

        result.imports.push(path.node.source.value);
    },
    CallExpression(path){

        result.methodCalls.push(path.node.callee.name);
    },
    ClassMethod(path){
        result.methods.push(path.node.key.name);
    }
})

console.log(JSON.stringify(result))