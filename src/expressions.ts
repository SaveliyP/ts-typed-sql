import { Expression, SQLType, TableType, ExpressionType, Parameter, ToSQLType } from './queries';
import { expression, exprToStr } from './utils';

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
<T extends number | boolean | string, A extends T | Expression<T, boolean, TableType>, B extends T | Expression<T, boolean, TableType>>
(a: A, op: ComparisonOperators, b: B):
Expression<boolean, AllGrouped<A | B>, ParameterType<A | B>>;

export function op
<T extends boolean[], A extends T | Expression<T, boolean, TableType>, B extends T | Expression<T, boolean, TableType>>
(a: A, op: '||' | '&' | '|' | '#', b: B):
Expression<boolean[], AllGrouped<A | B>, ParameterType<A | B>>;

export function op
<T extends number | BigInt, A extends T | Expression<T, boolean, TableType>, B extends T | Expression<T, boolean, TableType>>
(a: A, op: aMathOperators, b: B):
Expression<T, AllGrouped<A | B>, ParameterType<A | B>>;

export function op
<T extends SQLType, A extends T | Expression<T, boolean, TableType>, B extends T | Expression<T, boolean, TableType>>
(a: A, o: Operator, b: B):
Expression<SQLType, AllGrouped<A | B>, ParameterType<A | B>> {
    const p = precedences[o];
    return expression([...exprToStr(a, p), " ", o, " ", ...exprToStr(b, p)], p);
}

export function $b<K extends string | number | symbol>(id: K): Expression<boolean, true, {[key in K]: boolean}> {
    return $<boolean, K>(id);
}
export function $s<K extends string | number | symbol>(id: K): Expression<string, true, {[key in K]: string}> {
    return $<string, K>(id);
}
export function $<T extends SQLType, K extends string | number | symbol>(id: K): Expression<T, true, {[key in K]: T}> {
    var param: Parameter<T, K> = {
        name: id,
        type: <T> <any> null
    };
    return expression([param], 99);
}

type AsExpression<T extends SQLType | Expression<SQLType, boolean, TableType>> = T extends Expression<SQLType, boolean, any> ? T : Expression<ToSQLType<T>, true, {}>;
type ParameterType<T extends SQLType | Expression<SQLType, boolean, TableType>> = AsExpression<T>['parameters'];

type AllGrouped<T extends SQLType | Expression<SQLType, boolean, TableType>> = false extends (T extends Expression<SQLType, false, TableType> ? false : never) ? false : true;

export function between<
    T extends SQLType,
    A extends T | Expression<T, boolean, TableType>,
    B extends T | Expression<T, boolean, TableType>,
    C extends T | Expression<T, boolean, TableType>
>(a: A, x: B, y: C): Expression<boolean, AllGrouped<A | B | C>, ParameterType<A | B | C>> {
    return expression([...exprToStr(a, 6), " BETWEEN ", ...exprToStr(x, 6), " AND ", ...exprToStr(y, 6)], 6);
}

export function notBetween<
    T extends SQLType,
    A extends T | Expression<T, boolean, TableType>,
    B extends T | Expression<T, boolean, TableType>,
    C extends T | Expression<T, boolean, TableType>
>(a: A, x: B, y: C): Expression<boolean, AllGrouped<A | B | C>, ParameterType<A | B | C>> {
    return expression([...exprToStr(a, 6), " NOT BETWEEN ", ...exprToStr(x, 6), " AND ", ...exprToStr(y, 6)], 6);
}

export function betweenSymmetric<
    T extends SQLType,
    A extends T | Expression<T, boolean, TableType>,
    B extends T | Expression<T, boolean, TableType>,
    C extends T | Expression<T, boolean, TableType>
>(a: A, x: B, y: C): Expression<boolean, AllGrouped<A | B | C>, ParameterType<A | B | C>> {
    return expression([...exprToStr(a, 6), " BETWEEN SYMMETRIC ", ...exprToStr(x, 6), " AND ", ...exprToStr(y, 6)], 6);
}

export function notBetweenSymmetric<
    T extends SQLType,
    A extends T | Expression<T, boolean, TableType>,
    B extends T | Expression<T, boolean, TableType>,
    C extends T | Expression<T, boolean, TableType>
>(a: A, x: B, y: C): Expression<boolean, AllGrouped<A | B | C>, ParameterType<A | B | C>> {
    return expression([...exprToStr(a, 6), " NOT BETWEEN SYMMETRIC ", ...exprToStr(x, 6), " AND ", ...exprToStr(y, 6)], 6);
}

export function distinct<T extends SQLType, A extends T | Expression<T, boolean, TableType>, B extends T | Expression<T, boolean, TableType>>(a: A, b: B): Expression<boolean, AllGrouped<A | B>, ParameterType<A | B>> {
    return expression([...exprToStr(a, 4), " IS DISTINCT FROM ", ...exprToStr(b, 4)], 4);
}

export function notDistinct<T extends SQLType, A extends T | Expression<T, boolean, TableType>, B extends T | Expression<T, boolean, TableType>>(a: A, b: B): Expression<boolean, AllGrouped<A | B>, ParameterType<A | B>> {
    return expression([...exprToStr(a, 4), " IS NOT DISTINCT FROM ", ...exprToStr(b, 4)], 4);
}

export function isNull<T extends boolean | Expression<boolean, boolean, TableType>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    return expression([...exprToStr(a, 4), " IS NULL"], 4);
}

export function notNull(a: boolean): Expression<boolean, true, {}>;
export function notNull<P extends TableType, G extends boolean>(a: Expression<boolean, G, P>): Expression<boolean, G, P>;
export function notNull(a: boolean | Expression<boolean, boolean, TableType>): Expression<boolean, boolean, TableType> {
    return expression([...exprToStr(a, 4), " IS NOT NULL"], 4);
}

notNull($b("69"))

export function isTrue<T extends boolean | Expression<boolean, boolean, TableType>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    return expression([...exprToStr(a, 4), " IS TRUE"], 4);
}

export function notTrue<T extends boolean | Expression<boolean, boolean, TableType>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    return expression([...exprToStr(a, 4), " IS NOT TRUE"], 4);
}

export function isFalse<T extends boolean | Expression<boolean, boolean, TableType>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    return expression([...exprToStr(a, 4), " IS FALSE"], 4);
}

export function notFalse<T extends boolean | Expression<boolean, boolean, TableType>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    return expression([...exprToStr(a, 4), " IS NOT FALSE"], 4);
}

export function isUnknown<T extends boolean | Expression<boolean, boolean, TableType>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    return expression([...exprToStr(a, 4), " IS UNKNOWN"], 4);
}

export function notUnknown<T extends boolean | Expression<boolean, boolean, TableType>>(a: T): Expression<boolean, AllGrouped<T>, ParameterType<T>> {
    return expression([...exprToStr(a, 4), " IS NOT UNKNOWN"], 4);
}

export function and<P extends (boolean | Expression<boolean, boolean, TableType>)[]>(...expressions: P): Expression<boolean, AllGrouped<P[number]>, ParameterType<P[number]>> {
    const ret: ExpressionType[][] = new Array(expressions.length * 2 - 1);
    for (let i = 0; i < expressions.length; i++) {
        ret[2 * i] = exprToStr(expressions[i], 1);
    }
    for (let i = 1; i < ret.length; i += 2) {
        ret[i] = [" AND "];
    }
    return expression(ret.reduce((a, v) => {
        a.push(...v);
        return a;
    }, []), 2);
}

export function or<T extends (boolean | Expression<boolean, boolean, TableType>)[]>(...expressions: T): Expression<boolean, AllGrouped<T[number]>, ParameterType<T[number]>> {
    const ret: ExpressionType[][] = new Array(expressions.length * 2 - 1);
    for (let i = 0; i < expressions.length; i++) {
        ret[2 * i] = exprToStr(expressions[i], 1);
    }
    for (let i = 1; i < ret.length; i += 2) {
        ret[i] = [" OR "];
    }

    return expression(ret.reduce((a, v) => {
        a.push(...v);
        return a;
    }, []), 1);
}

type NotType = boolean | boolean[] | number;
export function not<U extends NotType>(a: U): Expression<ToSQLType<U> extends NotType ? ToSQLType<U> : never, true, {}>;
export function not<U extends Expression<NotType, boolean, TableType>>(a: U): U;
export function not<U extends NotType | Expression<NotType, boolean, TableType>>(a: U): Expression<NotType, boolean, TableType> {
    return expression(["~", ...exprToStr(a, 7)], 7);
}

type AvgType = number | BigInt;
export function avg<U extends AvgType>(a: U): Expression<ToSQLType<U> extends AvgType ? ToSQLType<U> : never, true, {}>;
export function avg<U extends Expression<AvgType, boolean, TableType>>(a: U): Expression<U['return_type'], true, U['parameters']>;
export function avg<U extends AvgType | Expression<AvgType, boolean, TableType>>(a: U): Expression<AvgType, true, TableType> {
    return expression(["AVG(", ...exprToStr(a, -99), ")"], 99);
}
