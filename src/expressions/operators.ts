import { SQLType } from "../columns";
import { Expression, Grouped, TableSubtype, ExpressionF } from "../query_types";
import { TypeParser, AllTypes } from "../types";
import { expressionWithParentheses } from "../utils";
import { Expr, AsET, asET, Ambiguous, possibleTypes } from "./common";

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
    "smallint": {
        ...makeOp("smallint", "smallint"),
        ...makeOp("integer", "integer"),
        ...makeOp("bigint", "bigint"),
        ...makeOp("numeric", "numeric"),
        ...makeOp("float", "double"),
        ...makeOp("double", "double"),
    },
    "integer": {
        ...makeOp("smallint", "integer"),
        ...makeOp("integer", "integer"),
        ...makeOp("bigint", "bigint"),
        ...makeOp("numeric", "numeric"),
        ...makeOp("float", "double"),
        ...makeOp("double", "double"),
    },
    "bigint": {
        ...makeOp("smallint", "bigint"),
        ...makeOp("integer", "bigint"),
        ...makeOp("bigint", "bigint"),
        ...makeOp("numeric", "numeric"),
        ...makeOp("float", "double"),
        ...makeOp("double", "double"),
    },
    "numeric": {
        ...makeOp("smallint", "numeric"),
        ...makeOp("integer", "numeric"),
        ...makeOp("bigint", "numeric"),
        ...makeOp("float", "double"),
        ...makeOp("double", "double"),
        ...makeOp("numeric", "numeric"),
    },
    "float": {
        ...makeOp("smallint", "double"),
        ...makeOp("integer", "double"),
        ...makeOp("bigint", "double"),
        ...makeOp("numeric", "double"),
        ...makeOp("float", "float"),
        ...makeOp("double", "double"),
    },
    "double": {
        ...makeOp("smallint", "double"),
        ...makeOp("integer", "double"),
        ...makeOp("bigint", "double"),
        ...makeOp("float", "double"),
        ...makeOp("double", "double"),
        ...makeOp("numeric", "double"),
    },
};

/*export type NumericTypes = "smallint" | "integer" | "bigint" | "numeric" | "float" | "double";
const NumericTypes: Set<NumericTypes> = new Set<NumericTypes>(["smallint", "integer", "bigint", "numeric", "float", "double"]);
export type NumericTps = {
    "smallint": {
        "smallint": true;
    };
    "integer": {
        "smallint": true;
        "integer": true;
    };
    "bigint": {
        "smallint": true;
        "integer": true;
        "bigint": true;
    };
    "numeric": {
        "smallint": true;
        "integer": true;
        "bigint": true;
        "numeric": true;
    };
    "float": {
        "smallint": true;
        "integer": true;
        "bigint": true;
        "numeric": true;
        "float": true;
    };
    "double": {
        "smallint": true;
        "integer": true;
        "bigint": true;
        "numeric": true;
        "float": true;
        "double": true;
    };
};
export type FindLesser<T> = {[key in keyof NumericTps]: T extends NumericTps[key] ? T : never};
export type FindGreater<T> = {[key in keyof NumericTps]: NumericTps[key] extends T ? T : never};*/

const mathIntOp = {
    "smallint": {
        ...makeOp("smallint", "smallint"),
        ...makeOp("integer", "integer"),
        ...makeOp("bigint", "bigint"),
        ...makeOp("numeric", "numeric"),
    },
    "integer": {
        ...makeOp("smallint", "integer"),
        ...makeOp("integer", "integer"),
        ...makeOp("bigint", "bigint"),
        ...makeOp("numeric", "numeric"),
    },
    "bigint": {
        ...makeOp("smallint", "bigint"),
        ...makeOp("integer", "bigint"),
        ...makeOp("bigint", "bigint"),
        ...makeOp("numeric", "numeric"),
    },
    "numeric": {
        ...makeOp("smallint", "numeric"),
        ...makeOp("integer", "numeric"),
        ...makeOp("bigint", "numeric"),
        ...makeOp("numeric", "numeric"),
    },
};

const compNumOp = {
    ...makeOp("smallint", "boolean"),
    ...makeOp("integer", "boolean"),
    ...makeOp("bigint", "boolean"),
    ...makeOp("float", "boolean"),
    ...makeOp("double", "boolean"),
    ...makeOp("numeric", "boolean"),
};

const compOp = {
    "smallint": compNumOp,
    "integer": compNumOp,
    "bigint": compNumOp,
    "float": compNumOp,
    "double": compNumOp,
    "numeric": compNumOp,
    "boolean": makeOp("boolean", "boolean"),
    "text": makeOp("text", "boolean"),
    "binary": makeOp("binary", "boolean"),
    "date": {
        ...makeOp("date", "boolean"),
        ...makeOp("timestamp", "boolean"),
    },
    "timestamp": {
        ...makeOp("date", "boolean"),
        ...makeOp("timestamp", "boolean"),
    },
    "time": makeOp("time", "boolean"),
    "json": makeOp("json", "boolean"),
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
export type ops = {[key in keyof typeof operators]: (typeof operators)[key]};

type DF<T> = T & SQLType; //TODO: figure out why just keyof (ops[O]) doesn't work

/*type A = {a: true};
type B = {a: true, b: true};
type C = A | B;
type D = {[key in keyof C]: C[key]};*/

export function op<Types extends AllTypes>(types: TypeParser<Types>) {
    type Allowed1<O extends keyof ops> = DF<keyof (ops[O])>;
    type Allowed2<O extends keyof ops, A extends Expr<Allowed1<O>, Types>> = DF<keyof (ops[O][TA<O, A>['return_type']])>;

    type TA<O extends keyof ops, A extends Expr<Allowed1<O>, Types>> = AsET<Types, Allowed1<O>, A>;
    type TB<O extends keyof ops, A extends Expr<Allowed1<O>, Types>, B extends Expr<Allowed2<O, A>, Types>> = AsET<Types, Allowed2<O, A>, B>;

    type Both<O extends keyof ops, A extends Expr<Allowed1<O>, Types>, B extends Expr<Allowed2<O, A>, Types>> = TA<O, A> | TB<O, A, B>;

    /*function mathOper(op: string) {
        return function<A extends Expr<NumericTypes, Types>, B extends Expr<NumericTypes, Types>>(a: A, b: B) {
            if (!(a instanceof Expression) && !(b instanceof Expression)) {
                throw Error(Ambiguous);
            }

            if (!(a instanceof Expression)) {

            }

            const possibleA = possibleTypes(NumericTypes, a, types);
            const possibleB = possibleTypes(NumericTypes, b, types);
        }
    }*/

    return function op
    <O extends keyof ops, A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>>
    (a: A, o: O, b: B):
    TA<O, A> extends never ? Ambiguous : TB<O, A, B> extends never ? Ambiguous : Expression<DF<ops[O][TA<O, A>['return_type']][TB<O, A, B>['return_type']]>, Grouped<Both<O, A, B>>, Both<O, A, B>['execute']> {
        const PRECEDENCE = precedences[o];

        const eA = asET(<Allowed1<O>[]> Object.keys(operators[o]), a, types);
        const eB = asET(<Allowed2<O, A>[]> Object.keys(operators[o][eA.return_type]), b, types);

        const exec: Both<O, A, B>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) => {
            const exprs = [eA, eB].map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters));
            return exprs[0] + " " + o + " " + exprs[1];
        };
        const type: DF<ops[O][TA<O, A>['return_type']][TB<O, A, B>['return_type']]> = <any> operators[o][eA.return_type][eB.return_type]; //WARN: Type-cast
        const grouped: Grouped<Both<O, A, B>> = Expression.allGrouped([eA, eB]);

        return <any> new Expression(exec, type, grouped, PRECEDENCE); //WARN: Type-cast
    }
};