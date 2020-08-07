import { Expression, ExpressionF, TableSubtype } from './query_types';
import { addPhantomProperties, withParentheses, expressionWithParentheses } from './utils';
import { SQLType } from './columns';
import { TypeParser, AllTypes } from './types';

//TODO: rewrite this with function overloading instead of whatever this is...

/*type BinOp<X, Op, Ret> = [[Expression<X, any> | X, Op, Expression<X, any> | X], Ret];
type BoolOp<X, Op> = BinOp<X, Op, boolean>
type Comparisons<X> =
    BoolOp<X, '<'> |
    BoolOp<X, '>'> |
    BoolOp<X, '<='> |
    BoolOp<X, '>='> |
    BoolOp<X, '='> |
    BoolOp<X, '<>'> |
    BoolOp<X, '!='>
;
type MathOperators<X> =
    BinOp<X, '+', X> |
    BinOp<X, '-', X> |
    BinOp<X, '*', X> |
    BinOp<X, '/', X> |
    BinOp<X, '%', X> |
    BinOp<X, '^', X> |
    BinOp<X, '&', X> |
    BinOp<X, '|', X>
;

type ShiftOperators<X> =
    [[Expression<X, any> | X, '<<', Expression<number, any> | number], X] |
    [[Expression<X, any> | X, '>>', Expression<number, any> | number], X]
;

type Operators =
    ShiftOperators<number> |
    ShiftOperators<boolean[]> |
    [[Expression<any, any> | any, '||', Expression<string, any> | string], string] |
    [[Expression<string, any> | string, '||', Expression<any, any> | any], string]
;*/

//Precedences:
//literal/parentheses: 99
//inside SELECT or DML statement: 0
//SELECT/DML statement: -1
//inside parentheses: -99
const comparisonPrecedences = {
    '<': 5,
    '>': 5,
    '<=': 5,
    '>=': 5,
    '=': 5,
    '<>': 5,
    '!=': 5
};
const mathPrecedences = {
    '+': 8,
    '-': 8,
    '*': 9,
    '/': 9,
    '%': 9,
    '^': 10
};
const precedences = {
    ...comparisonPrecedences,
    ...mathPrecedences,
    
    '&': 7,
    '|': 7,
    '&&': 7,
    '||': 7,
    '<<': 7,
    '>>': 7,
    '#': 7
};

function makeOp<B extends SQLType, R extends SQLType>(b: B, r: R) {
    var x: {[key in B]: R} = <any> {};
    x[b] = r;
    return x;
}

const mathOp = {
    "integer": {
        ...makeOp("integer", "integer"),
        ...makeOp("biginteger", "biginteger"),
        ...makeOp("float", "float"),
    },
    "biginteger": {
        ...makeOp("integer", "biginteger"),
        ...makeOp("biginteger", "biginteger"),
        ...makeOp("float", "float"),
    },
    "float": {
        ...makeOp("integer", "float"),
        ...makeOp("biginteger", "float"),
        ...makeOp("float", "float"),
    }
};

const mathIntOp = {
    "integer": {
        ...makeOp("integer", "integer"),
        ...makeOp("biginteger", "biginteger"),
    },
    "biginteger": {
        ...makeOp("integer", "biginteger"),
        ...makeOp("biginteger", "biginteger"),
    }
};

const compNumOp = {
    ...makeOp("integer", "boolean"),
    ...makeOp("biginteger", "boolean"),
    ...makeOp("float", "boolean"),
};

const compOp = {
    "integer": compNumOp,
    "biginteger": compNumOp,
    "float": compNumOp,
    "boolean": makeOp("boolean", "boolean"),
    "text": makeOp("text", "boolean"),
    "binary": makeOp("binary", "boolean"),
    "date": {
        ...makeOp("date", "boolean"),
        ...makeOp("datetime", "boolean"),
        ...makeOp("timestamp", "boolean"),
    },
    "timestamp": {
        ...makeOp("date", "boolean"),
        ...makeOp("datetime", "boolean"),
        ...makeOp("timestamp", "boolean"),
    },
    "time": makeOp("time", "boolean"),
    "json": makeOp("json", "boolean"),
    "uuid": makeOp("uuid", "boolean"),
}

const operators = {
    "+": mathOp,
    "-": mathOp,
    "*": mathOp,
    "/": mathOp,
    "^": mathOp,
    "%": mathIntOp,

    '<': compOp,
    '>': compOp,
    '<=': compOp,
    '>=': compOp,
    '=': compOp,
    '<>': compOp,
    '!=': compOp,
};
type operators = typeof operators;

//export function op
//<T extends boolean[], A extends T | Expression<T, boolean, ExpressionF<TableSubtype>>, B extends T | Expression<T, boolean, ExpressionF<TableSubtype>>>
//(a: A, op: '||' | '&' | '|' | '#', b: B):
//Expression<"boolean"[], AllGrouped<A | B>, ParameterType<A | B>>;

type DF<T> = T extends SQLType ? T : never;

export function op
<O extends keyof operators, A extends Expression<DF<keyof (operators[O])>, boolean, ExpressionF<TableSubtype>>, B extends Expression<DF<keyof operators[O][A['return_type']]>, boolean, ExpressionF<TableSubtype>>>
(a: A, o: O, b: B):
Expression<DF<operators[O][A['return_type']][B['return_type']]>, AllGrouped<A | B>, (A | B)['execute']> {
    const PRECEDENCE = precedences[o];
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) => {
            const exprs = [a, b].map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters));
            return exprs[0] + " " + o + " " + exprs[1];
        },
        return_type: <DF<operators[O][A['return_type']][B['return_type']]>> operators[o][a.return_type][b.return_type],
        precedence: PRECEDENCE
    });
}

type AllGrouped<T extends SQLType | Expression<SQLType, boolean, ExpressionF<TableSubtype>>> = false extends (T extends Expression<SQLType, false, ExpressionF<TableSubtype>> ? false : never) ? false : true;

export function between<T extends SQLType, A extends Expression<T, boolean, ExpressionF<TableSubtype>>, B extends Expression<T, boolean, ExpressionF<TableSubtype>>, C extends Expression<T, boolean, ExpressionF<TableSubtype>>>(a: A, b: B, c: C): Expression<"boolean", AllGrouped<A | B | C>, (A | B | C)['execute']> {
    const PRECEDENCE = 6;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) => {
            const exprs = [a, b, c].map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters));
            return exprs[0] + " BETWEEN " + exprs[1] + " AND " + exprs[2];
        },
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function notBetween<T extends SQLType, A extends Expression<T, boolean, ExpressionF<TableSubtype>>, B extends Expression<T, boolean, ExpressionF<TableSubtype>>, C extends Expression<T, boolean, ExpressionF<TableSubtype>>>(a: A, b: B, c: C): Expression<"boolean", AllGrouped<A | B | C>, (A | B | C)['execute']> {
    const PRECEDENCE = 6;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) => {
            const exprs = [a, b, c].map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters));
            return exprs[0] + " NOT BETWEEN " + exprs[1] + " AND " + exprs[2];
        },
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function betweenSymmetric<T extends SQLType, A extends Expression<T, boolean, ExpressionF<TableSubtype>>, B extends Expression<T, boolean, ExpressionF<TableSubtype>>, C extends Expression<T, boolean, ExpressionF<TableSubtype>>>(a: A, b: B, c: C): Expression<"boolean", AllGrouped<A | B | C>, (A | B | C)['execute']> {
    const PRECEDENCE = 6;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) => {
            const exprs = [a, b, c].map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters));
            return exprs[0] + " BETWEEN SYMMETRIC " + exprs[1] + " AND " + exprs[2];
        },
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function notBetweenSymmetric<T extends SQLType, A extends Expression<T, boolean, ExpressionF<TableSubtype>>, B extends Expression<T, boolean, ExpressionF<TableSubtype>>, C extends Expression<T, boolean, ExpressionF<TableSubtype>>>(a: A, b: B, c: C): Expression<"boolean", AllGrouped<A | B | C>, (A | B | C)['execute']> {
    const PRECEDENCE = 6;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) => {
            const exprs = [a, b, c].map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters));
            return exprs[0] + " NOT BETWEEN SYMMETRIC " + exprs[1] + " AND " + exprs[2];
        },
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function distinct<T extends SQLType, A extends Expression<T, boolean, ExpressionF<TableSubtype>>, B extends Expression<T, boolean, ExpressionF<TableSubtype>>>(a: A, b: B): Expression<"boolean", AllGrouped<A | B>, (A | B)['execute']> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) => {
            const exprs = [a, b].map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters));
            return exprs[0] + " IS DISTINCT FROM " + exprs[1];
        },
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function notDistinct<T extends SQLType, A extends Expression<T, boolean, ExpressionF<TableSubtype>>, B extends Expression<T, boolean, ExpressionF<TableSubtype>>>(a: A, b: B): Expression<"boolean", AllGrouped<A | B>, (A | B)['execute']> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) => {
            const exprs = [a, b].map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters));
            return exprs[0] + " IS NOT DISTINCT FROM " + exprs[1];
        },
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function isNull<T extends Expression<SQLType, boolean, ExpressionF<TableSubtype>>>(a: T): Expression<T['return_type'], T['grouped'], T['execute']> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) => {
            return expressionWithParentheses(PRECEDENCE, names, args, types, parameters)(a) + " IS NULL";
        },
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function notNull<T extends Expression<SQLType, boolean, ExpressionF<TableSubtype>>>(a: T): Expression<T['return_type'], T['grouped'], T['execute']> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            expressionWithParentheses(PRECEDENCE, names, args, types, parameters)(a) + " IS NOT NULL",
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function isTrue<T extends Expression<"boolean", boolean, ExpressionF<TableSubtype>>>(a: T): Expression<"boolean", T['grouped'], T['execute']> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            expressionWithParentheses(PRECEDENCE, names, args, types, parameters)(a) + " IS TRUE",
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function notTrue<T extends Expression<"boolean", boolean, ExpressionF<TableSubtype>>>(a: T): Expression<"boolean", T['grouped'], T['execute']> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            expressionWithParentheses(PRECEDENCE, names, args, types, parameters)(a) + " IS NOT TRUE",
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function isFalse<T extends Expression<"boolean", boolean, ExpressionF<TableSubtype>>>(a: T): Expression<"boolean", T['grouped'], T['execute']> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            expressionWithParentheses(PRECEDENCE, names, args, types, parameters)(a) + " IS FALSE",
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function notFalse<T extends Expression<"boolean", boolean, ExpressionF<TableSubtype>>>(a: T): Expression<"boolean", T['grouped'], T['execute']> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            expressionWithParentheses(PRECEDENCE, names, args, types, parameters)(a) + " IS NOT FALSE",
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function isUnknown<T extends Expression<"boolean", boolean, ExpressionF<TableSubtype>>>(a: T): Expression<"boolean", T['grouped'], T['execute']> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            expressionWithParentheses(PRECEDENCE, names, args, types, parameters)(a) + " IS UNKNOWN",
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function notUnknown<T extends Expression<"boolean", boolean, ExpressionF<TableSubtype>>>(a: T): Expression<"boolean", T['grouped'], T['execute']> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            expressionWithParentheses(PRECEDENCE, names, args, types, parameters)(a) + " IS NOT UNKNOWN",
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function and<T extends Expression<"boolean", boolean, ExpressionF<TableSubtype>>[]>(...expressions: T): Expression<"boolean", AllGrouped<T[number]>, T[number]['execute']> {
    const PRECEDENCE = 2;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            expressions.map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters)).join(" AND "),
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

export function or<T extends Expression<"boolean", boolean, ExpressionF<TableSubtype>>[]>(...expressions: T): Expression<"boolean", AllGrouped<T[number]>, T[number]['execute']> {
    const PRECEDENCE = 1;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            expressions.map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters)).join(" OR "),
        return_type: "boolean",
        precedence: PRECEDENCE
    });
}

//NOT - only on boolean
//~ - only on integers and bitstrings
export function not<T extends Expression<"boolean" | "integer" | "biginteger", boolean, ExpressionF<TableSubtype>>>(a: T): Expression<T['return_type'], T['grouped'], T['execute']> {
    const PRECEDENCE = a.return_type == "boolean" ? 3 : 7;
    const OPERATOR = a.return_type == "boolean" ? "NOT" : "~";
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            OPERATOR + expressionWithParentheses(PRECEDENCE, names, args, types, parameters)(a),
        return_type: a.return_type,
        precedence: PRECEDENCE
    });
}

export function avg<U extends Expression<"integer" | "biginteger" | "float", boolean, ExpressionF<TableSubtype>>>(a: U): Expression<U['return_type'], true, U['execute']> {
    const PRECEDENCE = 99;
    return addPhantomProperties({
        execute: <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            "AVG(" + withParentheses(a.execute(names, args, types)(parameters), -PRECEDENCE > a.precedence) + ")",
        return_type: a.return_type,
        precedence: PRECEDENCE
    });
}
