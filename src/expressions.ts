import { Expression, SQLType, ExpressionF } from './query_types';
import { addPhantomProperties, mapRawExpression } from './utils';

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
type ComparisonOperators = keyof typeof comparisonPrecedences;
type aMathOperators = keyof typeof mathPrecedences;
type Operator = keyof typeof precedences;

export function op
<T extends number | boolean | string, A extends T | Expression<T, boolean, ExpressionF<never>>, B extends T | Expression<T, boolean, ExpressionF<never>>>
(a: A, op: ComparisonOperators, b: B):
Expression<boolean, AllGrouped<A | B>, ParameterType<A | B>>;

export function op
<T extends boolean[], A extends T | Expression<T, boolean, ExpressionF<never>>, B extends T | Expression<T, boolean, ExpressionF<never>>>
(a: A, op: '||' | '&' | '|' | '#', b: B):
Expression<boolean[], AllGrouped<A | B>, ParameterType<A | B>>;

export function op
<A extends number | Expression<number, boolean, ExpressionF<never>>, B extends number | Expression<number, boolean, ExpressionF<never>>>
(a: A, op: aMathOperators, b: B):
Expression<number, AllGrouped<A | B>, ParameterType<A | B>>;
export function op
<A extends bigint | Expression<bigint, boolean, ExpressionF<never>>, B extends bigint | Expression<bigint, boolean, ExpressionF<never>>>
(a: A, op: aMathOperators, b: B):
Expression<bigint, AllGrouped<A | B>, ParameterType<A | B>>;

export function op
<T extends SQLType, A extends T | Expression<T, boolean, ExpressionF<never>>, B extends T | Expression<T, boolean, ExpressionF<never>>>
(a: A, o: Operator, b: B):
Expression<SQLType, AllGrouped<A | B>, ParameterType<A | B>> {
    const PRECEDENCE = precedences[o];
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) => {
            const exprs = [a, b].map(mapRawExpression(PRECEDENCE, parameters, names, args));
            return exprs[0] + " " + o + " " + exprs[1];
        },
        precedence: PRECEDENCE
    });
}

type AsExpression<T extends SQLType | Expression<SQLType, boolean, ExpressionF<never>>> = T extends SQLType ? Expression<T, true, ExpressionF<{}>> : T;
type ParameterType<T extends SQLType | Expression<SQLType, boolean, ExpressionF<never>>> = AsExpression<T>['execute'];

type AllGrouped<T extends SQLType | Expression<SQLType, boolean, ExpressionF<never>>> = false extends (T extends Expression<SQLType, false, ExpressionF<never>> ? false : never) ? false : true;

export function between<T extends SQLType, A extends T | Expression<T, boolean, ExpressionF<never>>, B extends T | Expression<T, boolean, ExpressionF<never>>, C extends T | Expression<T, boolean, ExpressionF<never>>>(a: A, b: B, c: C): Expression<boolean, AllGrouped<A | B | C>, ParameterType<A | B | C>> {
    const PRECEDENCE = 6;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) => {
            const exprs = [a, b, c].map(mapRawExpression(PRECEDENCE, parameters, names, args));
            return exprs[0] + " BETWEEN " + exprs[1] + " AND " + exprs[2];
        },
        precedence: PRECEDENCE
    });
}

export function notBetween<T extends SQLType, A extends T | Expression<T, boolean, ExpressionF<never>>, B extends T | Expression<T, boolean, ExpressionF<never>>, C extends T | Expression<T, boolean, ExpressionF<never>>>(a: A, b: B, c: C): Expression<boolean, AllGrouped<A | B | C>, ParameterType<A | B | C>> {
    const PRECEDENCE = 6;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) => {
            const exprs = [a, b, c].map(mapRawExpression(PRECEDENCE, parameters, names, args));
            return exprs[0] + " NOT BETWEEN " + exprs[1] + " AND " + exprs[2];
        },
        precedence: PRECEDENCE
    });
}

export function betweenSymmetric<T extends SQLType, A extends T | Expression<T, boolean, ExpressionF<never>>, B extends T | Expression<T, boolean, ExpressionF<never>>, C extends T | Expression<T, boolean, ExpressionF<never>>>(a: A, b: B, c: C): Expression<boolean, AllGrouped<A | B | C>, ParameterType<A | B | C>> {
    const PRECEDENCE = 6;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) => {
            const exprs = [a, b, c].map(mapRawExpression(PRECEDENCE, parameters, names, args));
            return exprs[0] + " BETWEEN SYMMETRIC " + exprs[1] + " AND " + exprs[2];
        },
        precedence: PRECEDENCE
    });
}

export function notBetweenSymmetric<T extends SQLType, A extends T | Expression<T, boolean, ExpressionF<never>>, B extends T | Expression<T, boolean, ExpressionF<never>>, C extends T | Expression<T, boolean, ExpressionF<never>>>(a: A, b: B, c: C): Expression<boolean, AllGrouped<A | B | C>, ParameterType<A | B | C>> {
    const PRECEDENCE = 6;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) => {
            const exprs = [a, b, c].map(mapRawExpression(PRECEDENCE, parameters, names, args));
            return exprs[0] + " NOT BETWEEN SYMMETRIC " + exprs[1] + " AND " + exprs[2];
        },
        precedence: PRECEDENCE
    });
}

export function distinct<T extends SQLType, A extends T | Expression<SQLType, boolean, ExpressionF<never>>, B extends T | Expression<SQLType, boolean, ExpressionF<never>>>(a: A, b: B): Expression<boolean, AllGrouped<A | B>, ParameterType<A | B>> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) => {
            const exprs = [a, b].map(mapRawExpression(PRECEDENCE, parameters, names, args));
            return exprs[0] + " IS DISTINCT FROM " + exprs[1];
        },
        precedence: PRECEDENCE
    });
}

export function notDistinct<T extends SQLType, A extends T | Expression<SQLType, boolean, ExpressionF<never>>, B extends T | Expression<SQLType, boolean, ExpressionF<never>>>(a: A, b: B): Expression<boolean, AllGrouped<A | B>, ParameterType<A | B>> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) => {
            const exprs = [a, b].map(mapRawExpression(PRECEDENCE, parameters, names, args));
            return exprs[0] + " IS NOT DISTINCT FROM " + exprs[1];
        },
        precedence: PRECEDENCE
    });
}

export function isNull<T extends SQLType | Expression<SQLType, boolean, ExpressionF<never>>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) => {
            return mapRawExpression(PRECEDENCE, parameters, names, args)(a) + " IS NULL";
        },
        precedence: PRECEDENCE
    });
}

export function notNull<T extends SQLType | Expression<SQLType, boolean, ExpressionF<never>>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) =>
            mapRawExpression(PRECEDENCE, parameters, names, args)(a) + " IS NOT NULL",
        precedence: PRECEDENCE
    });
}

export function isTrue<T extends boolean | Expression<boolean, boolean, ExpressionF<never>>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) =>
            mapRawExpression(PRECEDENCE, parameters, names, args)(a) + " IS TRUE",
        precedence: PRECEDENCE
    });
}

export function notTrue<T extends boolean | Expression<boolean, boolean, ExpressionF<never>>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) =>
            mapRawExpression(PRECEDENCE, parameters, names, args)(a) + " IS NOT TRUE",
        precedence: PRECEDENCE
    });
}

export function isFalse<T extends boolean | Expression<boolean, boolean, ExpressionF<never>>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) =>
            mapRawExpression(PRECEDENCE, parameters, names, args)(a) + " IS FALSE",
        precedence: PRECEDENCE
    });
}

export function notFalse<T extends boolean | Expression<boolean, boolean, ExpressionF<never>>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) =>
            mapRawExpression(PRECEDENCE, parameters, names, args)(a) + " IS NOT FALSE",
        precedence: PRECEDENCE
    });
}

export function isUnknown<T extends boolean | Expression<boolean, boolean, ExpressionF<never>>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) =>
            mapRawExpression(PRECEDENCE, parameters, names, args)(a) + " IS UNKNOWN",
        precedence: PRECEDENCE
    });
}

export function notUnknown<T extends boolean | Expression<boolean, boolean, ExpressionF<never>>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    const PRECEDENCE = 4;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) =>
            mapRawExpression(PRECEDENCE, parameters, names, args)(a) + " IS NOT UNKNOWN",
        precedence: PRECEDENCE
    });
}

export function and<T extends (boolean | Expression<boolean, boolean, ExpressionF<never>>)[]>(...expressions: T): Expression<boolean, AllGrouped<T[number]>, ParameterType<T[number]>> {
    const PRECEDENCE = 2;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) =>
            expressions.map(mapRawExpression(PRECEDENCE, parameters, names, args)).join(" AND "),
        precedence: PRECEDENCE
    });
}

export function or<T extends (boolean | Expression<boolean, boolean, ExpressionF<never>>)[]>(...expressions: T): Expression<boolean, AllGrouped<T[number]>, ParameterType<T[number]>> {
    const PRECEDENCE = 1;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) =>
            expressions.map(mapRawExpression(PRECEDENCE, parameters, names, args)).join(" OR "),
        precedence: PRECEDENCE
    });
}

type NotType = boolean | boolean[] | number;
export function not<T extends NotType | Expression<NotType, boolean, ExpressionF<never>>>(a: T): Expression<AsExpression<T>['return_type'], AsExpression<T>['grouped'], ParameterType<T>> {
    const PRECEDENCE = 7;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) =>
            "~" + mapRawExpression(PRECEDENCE, parameters, names, args)(a),
        precedence: PRECEDENCE
    });
}

type AvgType = number | bigint;
export function avg(a: number): Expression<number, true, ExpressionF<{}>>;
export function avg(a: bigint): Expression<bigint, true, ExpressionF<{}>>;
export function avg<U extends Expression<AvgType, boolean, ExpressionF<never>>>(a: U): Expression<U['return_type'], true, U['execute']>;
export function avg<U extends AvgType | Expression<AvgType, boolean, ExpressionF<never>>>(a: U): Expression<AvgType, true, ExpressionF<never>> {
    const PRECEDENCE = 99;
    return addPhantomProperties({
        execute: (names: {[key: string]: number}, args: SQLType[]) => (parameters: never) =>
            "AVG(" + mapRawExpression(-PRECEDENCE, parameters, names, args)(a) + ")",
        precedence: PRECEDENCE
    });
}
