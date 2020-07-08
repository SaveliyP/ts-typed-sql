import { Expression } from './queries';

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

function exprToStr<T>(expression: Expression<T, any> | T) {
    if (expression instanceof Function) {
        return expression();
    } else if (typeof expression === 'number') {
        return expression.toString();
    } else if (typeof expression === 'boolean') {
        return expression ? "true" : "false";
    } else if (typeof expression === 'string') {
        return "CAST (X'" + new Buffer(expression).toString("hex") + "' AS TEXT)";
    } else if (expression instanceof Buffer) {
        return "X'" + expression.toString("hex") + "'";
    } else if (expression instanceof Array) {
        return "B'" + expression.map(x => (x ? "1" : "0")).join("") + "'";
    }
    throw new Error("Bad type!");
}

function expression<T, U extends boolean>(expr: string): Expression<T, U> {
    return <Expression<T, U>> (() => expr);
}

type Gr<T> = T extends Expression<any, false> ? false : true;
type And<T, U> = T extends false ? false : U;
type FirstThirdGrouped<T extends Operators[0]> = And<Gr<T[0]>, Gr<T[2]>>;

type ComparisonOperators = '<' | '>' | '<=' | '>=' | '=' | '<>' | '!=';

export function op(a: Expression<number, true> | number, op: ComparisonOperators, b: Expression<number, true> | number): Expression<boolean, true>;
export function op(a: Expression<number, any> | number, op: ComparisonOperators, b: Expression<number, any> | number): Expression<boolean, false>;

export function op<T extends Operators>(...parameters: T[0]): Expression<T[1], FirstThirdGrouped<T[0]>> {
    return expression("(" + exprToStr(parameters[0]) + ") " + parameters[1] + " (" + exprToStr(parameters[2]) + ")");
}

export function $<T>(id: number): Expression<T, true> {
    return expression("$" + id);
}

type ThreeGrouped<T, U, V> = And<Gr<T>, And<Gr<U>, Gr<V>>>;
export function between<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T, C extends Expression<T, any> | T>(a: A, x: B, y: C): Expression<boolean, ThreeGrouped<A, B, C>> {
    return expression("(" + exprToStr(a) + ") BETWEEN (" + exprToStr(x) + ") AND (" + exprToStr(y) + ")");
}

export function notBetween<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T, C extends Expression<T, any> | T>(a: A, x: B, y: C): Expression<boolean, ThreeGrouped<A, B, C>> {
    return expression("(" + exprToStr(a) + ") NOT BETWEEN (" + exprToStr(x) + ") AND (" + exprToStr(y) + ")");
}

export function betweenSymmetric<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T, C extends Expression<T, any> | T>(a: A, x: B, y: C): Expression<boolean, ThreeGrouped<A, B, C>> {
    return expression("(" + exprToStr(a) + ") BETWEEN SYMMETRIC (" + exprToStr(x) + ") AND (" + exprToStr(y) + ")");
}

export function notBetweenSymmetric<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T, C extends Expression<T, any> | T>(a: A, x: B, y: C): Expression<boolean, ThreeGrouped<A, B, C>> {
    return expression("(" + exprToStr(a) + ") NOT BETWEEN SYMMETRIC (" + exprToStr(x) + ") AND (" + exprToStr(y) + ")");
}

export function distinct<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T>(a: A, b: B): Expression<boolean, And<Gr<A>, Gr<B>>> {
    return expression("(" + exprToStr(a) + ") IS DISTINCT FROM (" + exprToStr(b) + ")");
}

export function notDistinct<T, A extends Expression<T, any> | T, B extends Expression<T, any> | T>(a: A, b: B): Expression<boolean, And<Gr<A>, Gr<B>>> {
    return expression("(" + exprToStr(a) + ") IS NOT DISTINCT FROM (" + exprToStr(b) + ")");
}

export function isNull<T>(a: T): Expression<boolean, Gr<T>> {
    return expression("(" + exprToStr(a) + ") IS NULL");
}

export function notNull<T>(a: T): Expression<boolean, Gr<T>> {
    return expression("(" + exprToStr(a) + ") IS NOT NULL");
}

export function isTrue<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression("(" + exprToStr(a) + ") IS TRUE");
}

export function notTrue<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression("(" + exprToStr(a) + ") IS NOT TRUE");
}

export function isFalse<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression("(" + exprToStr(a) + ") IS FALSE");
}

export function notFalse<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression("(" + exprToStr(a) + ") IS NOT FALSE");
}

export function isUnknown<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression("(" + exprToStr(a) + ") IS UNKNOWN");
}

export function notUnknown<T extends boolean | Expression<boolean, any>>(a: T): Expression<boolean, Gr<T>> {
    return expression("(" + exprToStr(a) + ") IS NOT UNKNOWN");
}

export function and(...expressions: (boolean | Expression<boolean, true>)[]): Expression<boolean, true>;
export function and(...expressions: (boolean | Expression<boolean, true> | Expression<boolean, false>)[]): Expression<boolean, false>;
export function and(...expressions: (boolean | Expression<boolean, any>)[]): Expression<boolean, any> {
    return expression(expressions.map(x => "(" + exprToStr(x) + ")").join(" AND "));
}

const FalseExpr: Expression<boolean, false> = expression("AYY LMAO");

const t1 = and(true, notUnknown(false));
const t2 = and(true, notUnknown(false), FalseExpr);

export function or(...expressions: (boolean | Expression<boolean, true>)[]): Expression<boolean, true>;
export function or(...expressions: (boolean | Expression<boolean, true> | Expression<boolean, false>)[]): Expression<boolean, false>;
export function or(...expressions: (boolean | Expression<boolean, any>)[]): Expression<boolean, any> {
    return expression(expressions.map(x => "(" + exprToStr(x) + ")").join(" OR "));
}

type NotType = boolean | boolean[] | number;
export function not<U extends NotType | Expression<NotType, any>>(a: U): Expression<U extends Expression<any, any> ? U['return_type'] : U, Gr<U>> {
    return expression("~(" + exprToStr(a) + ")");
}
type AvgType = number | BigInt;
export function avg<U extends AvgType | Expression<AvgType, any>>(a: U): Expression<U extends Expression<any, any> ? U['return_type'] : U, true> {
    return expression("AVG(" + exprToStr(a) + ")");
}
