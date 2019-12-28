import { walk } from 'estree-walker';

const extractors = {
	ArrayPattern(names, param) {
		for (const element of param.elements) {
			if (element) extractors[element.type](names, element);
		}
	},

	AssignmentPattern(names, param) {
		extractors[param.left.type](names, param.left);
	},

	Identifier(names, param) {
		names.push(param.name);
	},

	MemberExpression() {},

	ObjectPattern(names, param) {
		for (const prop of param.properties) {
			if (prop.type === 'RestElement') {
				extractors.RestElement(names, prop);
			} else {
				extractors[prop.value.type](names, prop.value);
			}
		}
	},

	RestElement(names, param) {
		extractors[param.argument.type](names, param.argument);
	}
};

const extractAssignedNames = function extractAssignedNames(param) {
	const names = [];

	extractors[param.type](names, param);
	return names;
};

const blockDeclarations = {
	const: true,
	let: true
};

class Scope {
	constructor(options = {}) {
		this.parent = options.parent;
		this.isBlockScope = !!options.block;

		this.declarations = Object.create(null);

		if (options.params) {
			options.params.forEach(param => {
				extractAssignedNames(param).forEach(name => {
					this.declarations[name] = true;
				});
			});
		}
	}

	addDeclaration(node, isBlockDeclaration, isVar) {
		if (!isBlockDeclaration && this.isBlockScope) {
			// it's a `var` or function node, and this
			// is a block scope, so we need to go up
			this.parent.addDeclaration(node, isBlockDeclaration, isVar);
		} else if (node.id) {
			extractAssignedNames(node.id).forEach(name => {
				this.declarations[name] = true;
			});
		}
	}

	contains(name) {
		return this.declarations[name] || (this.parent ? this.parent.contains(name) : false);
	}
}

const attachScopes = function attachScopes(ast, propertyName = 'scope') {
	let scope = new Scope();

	walk(ast, {
		enter(node, parent) {
			// function foo () {...}
			// class Foo {...}
			if (/(Function|Class)Declaration/.test(node.type)) {
				scope.addDeclaration(node, false, false);
			}

			// var foo = 1
			if (node.type === 'VariableDeclaration') {
				const { kind } = node;
				const isBlockDeclaration = blockDeclarations[kind];

				node.declarations.forEach(declaration => {
					scope.addDeclaration(declaration, isBlockDeclaration, true);
				});
			}

			let newScope;

			// create new function scope
			if (/Function/.test(node.type)) {
				newScope = new Scope({
					parent: scope,
					block: false,
					params: node.params
				});

				// named function expressions - the name is considered
				// part of the function's scope
				if (node.type === 'FunctionExpression' && node.id) {
					newScope.addDeclaration(node, false, false);
				}
			}

			// create new block scope
			if (node.type === 'BlockStatement' && !/Function/.test(parent.type)) {
				newScope = new Scope({
					parent: scope,
					block: true
				});
			}

			// catch clause has its own block scope
			if (node.type === 'CatchClause') {
				newScope = new Scope({
					parent: scope,
					params: node.param ? [node.param] : [],
					block: true
				});
			}

			if (newScope) {
				Object.defineProperty(node, propertyName, {
					value: newScope,
					configurable: true
				});

				scope = newScope;
			}
		},
		leave(node) {
			if (node[propertyName]) scope = scope.parent;
		}
	});

	return scope;
};

const createFilter = () => () => true;

const reservedWords =
	'break case class catch const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield enum await implements package protected static interface private public';
const builtins =
	'arguments Infinity NaN undefined null true false eval uneval isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent encodeURI encodeURIComponent escape unescape Object Function Boolean Symbol Error EvalError InternalError RangeError ReferenceError SyntaxError TypeError URIError Number Math Date String RegExp Array Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array Map Set WeakMap WeakSet SIMD ArrayBuffer DataView JSON Promise Generator GeneratorFunction Reflect Proxy Intl';

const forbiddenIdentifiers = new Set(`${reservedWords} ${builtins}`.split(' '));
forbiddenIdentifiers.add('');

const makeLegalIdentifier = function makeLegalIdentifier(str) {
	let identifier = str
		.replace(/-(\w)/g, (_, letter) => letter.toUpperCase())
		.replace(/[^$_a-zA-Z0-9]/g, '_');

	if (/\d/.test(identifier[0]) || forbiddenIdentifiers.has(identifier)) {
		identifier = `_${identifier}`;
	}

	return identifier || '_';
};

export { createFilter, attachScopes, extractAssignedNames, makeLegalIdentifier };
