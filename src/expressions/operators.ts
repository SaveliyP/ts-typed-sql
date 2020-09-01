import { SQLType } from "../columns";
import { Expression, Grouped, TableSubtype, ExpressionF } from "../query_types";
import { TypeParser, AllTypes } from "../types";
import { expressionWithParentheses } from "../utils";
import { Expr, AsET, asET, Ambiguous, possibleTypes, possibleTypesEx, FindTypesEx, matchTypes, MatchType, TypeGroup, NumericSQLTypes, NumericTypeSet, SQLTypeSet } from "./common";

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
//    '%': 9,
    '^': 10
};
const precedences = {
    '&': 7,
    '|': 7,
    '&&': 7,
    '||': 7,
    '<<': 7,
    '>>': 7,
    '#': 7
};

export type LargestNumeric<A extends SQLType, B extends SQLType> =
    (A | B) extends NumericSQLTypes ?
    ("float" extends (A & B) ? "float" :
    "double" extends (A | B) ? "double" :
    "float" extends (A | B) ? "double" :
    "numeric" extends (A | B) ? "numeric" :
    "bigint" extends (A | B) ? "bigint" :
    "integer" extends (A | B) ? "integer" :
    "smallint") : never;
function findLargestNumeric<A extends SQLType, B extends SQLType>(a: A, b: B): LargestNumeric<A, B> {
    if (!NumericTypeSet.has(<any> a) || !NumericTypeSet.has(<any> b)) { //WARN: Type-cast
        throw Error(Ambiguous);
    }

    if (a == "float" && b == "float") {
        return <any> "float"; //WARN: Type-cast
    } else if (a == "double" || a == "float" || b == "double" || b == "float") {
        return <any> "double"; //WARN: Type-cast
    } else if (a == "numeric" || b == "numeric") {
        return <any> "numeric"; //WARN: Type-cast
    } else if (a == "bigint" || b == "bigint") {
        return <any> "bigint"; //WARN: Type-cast
    } else if (a == "integer" || b == "integer") {
        return <any> "integer"; //WARN: Type-cast
    } else {
        return <any> "smallint"; //WARN: Type-cast
    }
}

export type MatchedAB<Types extends AllTypes, AllowedTypes extends SQLType, A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>> = MatchType<FindTypesEx<Types, AllowedTypes, A>, FindTypesEx<Types, AllowedTypes, B>>;
export type MatchedExprAB<Types extends AllTypes, AllowedTypes extends SQLType, A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>> = AsET<Types, MatchedAB<Types, AllowedTypes, A, B>, A>;

export type MathResult<Types extends AllTypes, A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>> = Expression<LargestNumeric<MatchedAB<Types, NumericSQLTypes, A, B>, MatchedAB<Types, NumericSQLTypes, B, A>>, Grouped<MatchedExprAB<Types, NumericSQLTypes, A, B> | MatchedExprAB<Types, NumericSQLTypes, B, A>>, (MatchedExprAB<Types, NumericSQLTypes, A, B> | MatchedExprAB<Types, NumericSQLTypes, B, A>)['execute']>;
export type CorrectedMathResult<Types extends AllTypes, A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>> = MatchedAB<Types, NumericSQLTypes, A, B> extends never ? Ambiguous : MatchedAB<Types, NumericSQLTypes, B, A> extends never ? Ambiguous : MathResult<Types, A, B>;
//TODO: need to support DATE/TIME addition too
function mathOper<Types extends AllTypes>(op: keyof typeof mathPrecedences, types: TypeParser<Types>) {
    const PRECEDENCE = mathPrecedences[op];

    return function operation<A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>>(a: A, b: B) {
        var possibleA = possibleTypesEx(NumericTypeSet, a, types);
        var possibleB = possibleTypesEx(NumericTypeSet, b, types);
        
        const matchedA = matchTypes(possibleA, possibleB);
        const matchedB = matchTypes(possibleB, possibleA);

        const eA: MatchedExprAB<Types, NumericSQLTypes, A, B> = asET([matchedA], a, types);
        const eB: MatchedExprAB<Types, NumericSQLTypes, B, A> = asET([matchedB], b, types);

        const exec: MathResult<Types, A, B>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) => {
            const exprs = [eA, eB].map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters));
            return exprs[0] + " " + op + " " + exprs[1];
        };

        const expr: MathResult<Types, A, B> = new Expression(exec, findLargestNumeric(matchedA, matchedB), Expression.allGrouped([eA, eB]), PRECEDENCE);

        return <CorrectedMathResult<Types, A, B>> expr;
    }
}

export type CompResult<Types extends AllTypes, A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>> = Expression<"boolean", Grouped<MatchedExprAB<Types, SQLType, A, B> | MatchedExprAB<Types, SQLType, B, A>>, (MatchedExprAB<Types, SQLType, A, B> | MatchedExprAB<Types, SQLType, B, A>)['execute']>;
export type CorrectedCompResult<Types extends AllTypes, A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>> = MatchedAB<Types, SQLType, A, B> extends never ? Ambiguous : MatchedAB<Types, SQLType, B, A> extends never ? Ambiguous : TypeGroup[MatchedAB<Types, SQLType, A, B>] extends TypeGroup[MatchedAB<Types, SQLType, B, A>] ? CompResult<Types, A, B> : Ambiguous;
function compOper<Types extends AllTypes>(op: keyof typeof comparisonPrecedences, types: TypeParser<Types>) {
    const PRECEDENCE = comparisonPrecedences[op];

    return function operation<A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>>(a: A, b: B) {
        var possibleA = possibleTypesEx(SQLTypeSet, a, types);
        var possibleB = possibleTypesEx(SQLTypeSet, b, types);
        
        const matchedA = matchTypes(possibleA, possibleB);
        const matchedB = matchTypes(possibleB, possibleA);

        const eA: MatchedExprAB<Types, SQLType, A, B> = asET([matchedA], a, types);
        const eB: MatchedExprAB<Types, SQLType, B, A> = asET([matchedB], b, types);

        const exec: CompResult<Types, A, B>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) => {
            const exprs = [eA, eB].map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters));
            return exprs[0] + " " + op + " " + exprs[1];
        };

        const expr: CompResult<Types, A, B> = new Expression(exec, "boolean", Expression.allGrouped([eA, eB]), PRECEDENCE);

        return <CorrectedCompResult<Types, A, B>> expr;
    }
}

export function op<Types extends AllTypes>(types: TypeParser<Types>) {
    return Object.assign(function op<O extends keyof typeof comparisonPrecedences | keyof typeof mathPrecedences, A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>>(a: A, o: O, b: B): O extends keyof typeof mathPrecedences ? CorrectedMathResult<Types, A, B> : O extends keyof typeof comparisonPrecedences ? CorrectedCompResult<Types, A, B> : Ambiguous {
        if (mathPrecedences[<keyof typeof mathPrecedences> o] != null) { //WARN: Type-cast
            return <any> mathOper(<any> o, types)(a, b); //WARN: Type-cast
        } else if (comparisonPrecedences[<keyof typeof comparisonPrecedences> o] != null) { //WARN: Type-cast
            return <any> compOper(<any> o, types)(a, b); //WARN: Type-cast
        } else {
            throw Error(Ambiguous);
        }
    }, {
        "add": mathOper("+", types),
        "sub": mathOper("-", types),
        "mult": mathOper("*", types),
        "div": mathOper("/", types),
        "pow": mathOper("^", types),
        //"mod": mathIntOper("%", types),

        'lt': compOper("<", types),
        'gt': compOper(">", types),
        'lte': compOper("<=", types),
        'gte': compOper(">=", types),
        'eq': compOper("=", types),
        'neq': compOper("!=", types),
    });
};