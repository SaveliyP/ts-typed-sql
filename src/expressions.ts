import { Expression } from './queries';
import { expression, exprToStr } from './utils';

//TODO: rewrite this with function overloading instead of whatever this is...

type BinOp<X, Op, Ret> = [[Expression<X, any> | X, Op, Expression<X, any> | X], Ret];
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
    BinOp<X, '|', X> |
    BinOp<X, '^', X>
;

type ShiftOperators<X> =
    [[Expression<X, any> | X, '<<', Expression<number, any> | number], X] |
    [[Expression<X, any> | X, '>>', Expression<number, any> | number], X]
;

type Operators =
    Comparisons<number> |
    MathOperators<number> |
    ShiftOperators<number> |
    Comparisons<boolean> |
    Comparisons<string> |
    BinOp<boolean[], '||', boolean[]> |
    BinOp<boolean[], '&', boolean[]> |
    BinOp<boolean[], '|', boolean[]> |
    BinOp<boolean[], '#', boolean[]> |
    ShiftOperators<boolean[]> |
    [[Expression<any, any> | any, '||', Expression<string, any> | string], string] |
    [[Expression<string, any> | string, '||', Expression<any, any> | any], string]
;

type Gr<T> = T extends Expression<any, false> ? false : true;
type And<T, U> = T extends false ? false : U;
type FirstThirdGrouped<T extends Operators[0]> = And<Gr<T[0]>, Gr<T[2]>>;

type ComparisonOperators = '<' | '>' | '<=' | '>=' | '=' | '<>' | '!=';

//Precedences:
//literal/parentheses: 99
//inside SELECT or DML statement: 0
//SELECT/DML statement: -1
//inside parentheses: -99
const precedences = {
    '<': 5,
    '>': 5,
    '<=': 5,
    '>=': 5,
    '=': 5,
    '<>': 5,
    '!=': 5,

    '+': 8,
    '-': 8,
    '*': 9,
    '/': 9,
    '%': 9,
    '^': 10,
    
    '&': 7,
    '|': 7,
    '&&': 7,
    '||': 7,
    '<<': 7,
    '>>': 7,
    '#': 7
};

export function op(a: Expression<number, true> | number, op: ComparisonOperators, b: Expression<number, true> | number): Expression<boolean, true>;
export function op(a: Expression<number, any> | number, op: ComparisonOperators, b: Expression<number, any> | number): Expression<boolean, false>;

export function op<T extends Operators>(...parameters: T[0]): Expression<T[1], FirstThirdGrouped<T[0]>> {
    const p = precedences[parameters[1]];
    return expression(exprToStr(parameters[0], p) + " " + parameters[1] + " " + exprToStr(parameters[2], p), p);
}

export function $<T>(id: number): Expression<T, true> {
    return expression("$" + id, 99);
}

type ThreeGrouped<T, U, V> = And<Gr<T>, And<Gr<U>, Gr<V>>>;
export function between<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T, C extends Expression<T, any> | T>(a: A, x: B, y: C): Expression<boolean, ThreeGrouped<A, B, C>> {
    return expression(exprToStr(a, 6) + " BETWEEN " + exprToStr(x, 6) + " AND " + exprToStr(y, 6), 6);
}

export function notBetween<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T, C extends Expression<T, any> | T>(a: A, x: B, y: C): Expression<boolean, ThreeGrouped<A, B, C>> {
    return expression(exprToStr(a, 6) + " NOT BETWEEN " + exprToStr(x, 6) + " AND " + exprToStr(y, 6), 6);
}

export function betweenSymmetric<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T, C extends Expression<T, any> | T>(a: A, x: B, y: C): Expression<boolean, ThreeGrouped<A, B, C>> {
    return expression(exprToStr(a, 6) + " BETWEEN SYMMETRIC " + exprToStr(x, 6) + " AND " + exprToStr(y, 6), 6);
}

export function notBetweenSymmetric<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T, C extends Expression<T, any> | T>(a: A, x: B, y: C): Expression<boolean, ThreeGrouped<A, B, C>> {
    return expression(exprToStr(a, 6) + " NOT BETWEEN SYMMETRIC " + exprToStr(x, 6) + " AND " + exprToStr(y, 6), 6);
}

export function distinct<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T>(a: A, b: B): Expression<boolean, And<Gr<A>, Gr<B>>> {
    return expression(exprToStr(a, 4) + " IS DISTINCT FROM " + exprToStr(b, 4), 4);
}

export function notDistinct<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T>(a: A, b: B): Expression<boolean, And<Gr<A>, Gr<B>>> {
    return expression(exprToStr(a, 4) + " IS NOT DISTINCT FROM " + exprToStr(b, 4), 4);
}

export function isNull<T>(a: T): Expression<boolean, Gr<T>> {
    return expression(exprToStr(a, 4) + " IS NULL", 4);
}

export function notNull<T>(a: T): Expression<boolean, Gr<T>> {
    return expression(exprToStr(a, 4) + " IS NOT NULL", 4);
}

export function isTrue<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression(exprToStr(a, 4) + " IS TRUE", 4);
}

export function notTrue<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression(exprToStr(a, 4) + " IS NOT TRUE", 4);
}

export function isFalse<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression(exprToStr(a, 4) + " IS FALSE", 4);
}

export function notFalse<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression(exprToStr(a, 4) + " IS NOT FALSE", 4);
}

export function isUnknown<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression(exprToStr(a, 4) + " IS UNKNOWN", 4);
}

export function notUnknown<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression(exprToStr(a, 4) + " IS NOT UNKNOWN", 4);
}

export function and(...expressions: (boolean | Expression<boolean, true>)[]): Expression<boolean, true>;
export function and(...expressions: (boolean | Expression<boolean, true> | Expression<boolean, false>)[]): Expression<boolean, false>;
export function and(...expressions: (boolean | Expression<boolean, any>)[]): Expression<boolean, any> {
    return expression(expressions.map(x => exprToStr(x, 2)).join(" AND "), 2);
}

const FalseExpr: Expression<boolean, false> = expression("AYY LMAO", 99);

const t1 = and(true, notUnknown(false));
const t2 = and(true, notUnknown(false), FalseExpr);

export function or(...expressions: (boolean | Expression<boolean, true>)[]): Expression<boolean, true>;
export function or(...expressions: (boolean | Expression<boolean, true> | Expression<boolean, false>)[]): Expression<boolean, false>;
export function or(...expressions: (boolean | Expression<boolean, any>)[]): Expression<boolean, any> {
    return expression(expressions.map(x => exprToStr(x, 1)).join(" OR "), 1);
}

type NotType = boolean | boolean[] | number;
export function not<U extends NotType | Expression<NotType, any>>(a: U): Expression<U extends Expression<any, any> ? U['return_type'] : U, Gr<U>> {
    return expression("~" + exprToStr(a, 7), 7);
}
type AvgType = number | BigInt;
export function avg<U extends AvgType | Expression<AvgType, any>>(a: U): Expression<U extends Expression<any, any> ? U['return_type'] : U, true> {
    return expression("AVG(" + exprToStr(a, -99) + ")", 99);
}
