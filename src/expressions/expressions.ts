import { Expression, ExpressionF, TableSubtype, Grouped } from '../query_types';
import { withParentheses, expressionWithParentheses, sqlmap } from '../utils';
import { SQLType } from '../columns';
import { TypeParser, AllTypes, defaultTypes } from '../types';
import { asET, Expr, AsET, Ambiguous, SQLTypeSet, possibleTypesEx, matchTypes } from './common';
import { MatchedExprAB, CompResult, CorrectedCompResult } from './operators';

const NumComp2 = sqlmap({
    "smallint": "boolean",
    "integer": "boolean",
    "bigint": "boolean",
    "float": "boolean",
    "double": "boolean",
    "numeric": "boolean"
});

const AllBools2 = {
    "smallint": NumComp2,
    "integer": NumComp2,
    "bigint": NumComp2,
    "float": NumComp2,
    "double": NumComp2,
    "numeric": NumComp2,

    "boolean": sqlmap({
        "boolean": "boolean",
    }),
    "bit": sqlmap({
        "bit": "boolean",
    }),
    "binary": sqlmap({
        "binary": "boolean",
    }),

    "text": sqlmap({
        "text": "boolean",
    }),

    "enum": sqlmap({
        "enum": "boolean",
    }),
    "json": sqlmap({
        "json": "boolean",
    }),

    "time": sqlmap({
        "time": "boolean",
    }),
    "date": sqlmap({
        "date": "boolean",
        "timestamp": "boolean",
    }),
    "timestamp": sqlmap({
        "date": "boolean",
        "timestamp": "boolean",
    }),
};
export type AllBools2 = {[key in keyof typeof AllBools2]: (typeof AllBools2)[key]};

const AvgTypes = sqlmap({
    "smallint": "numeric",
    "integer": "numeric",
    "bigint": "numeric",
    "numeric": "numeric",
    "float": "double",
    "double": "double"
});

const NotTypes = sqlmap({
    "smallint": "smallint",
    "integer": "integer",
    "bigint": "bigint",
    "bit": "bit"
});

export function expressions<Types extends AllTypes>(types: TypeParser<Types>) {
type Exp<T extends SQLType> = Expr<T, Types>;
type AsE<A extends SQLType, T extends Exp<A>> = AsET<Types, A, T>;

const asE = <A extends SQLType, T extends Exp<A>>(allowed: A[], x: T) => asET(allowed, x, types);

function expr1<ArgTypes extends {[key: string]: SQLType}, G extends boolean>(args: ArgTypes, PRECEDENCE: number, str: string[], group: G, inversePrecedence?: boolean) {
    type FS<T> = T & SQLType;
    type Args = FS<keyof ArgTypes>;
    function func<T extends Exp<Args>>(a: T): Expression<ArgTypes[AsE<Args, T>['return_type']], G extends true ? true : Grouped<AsE<Args, T>>, AsE<Args, T>['execute']> {
        const eA = asE(<Args[]> Object.keys(args), a); //WARN: Type-cast

        const typ: ArgTypes[AsE<Args, T>['return_type']] = args[eA.return_type];
        const ex: ExpressionF<TableSubtype> = eA.execute;
        const grouped: G extends true ? true : Grouped<AsE<Args, T>> = <G extends true ? true : Grouped<AsE<Args, T>>> (group ? true : Expression.allGrouped([eA])); //WARN: Type-cast
    
        const exec: AsE<Args, T>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            str[0] + withParentheses(ex(names, args, types)(parameters), (inversePrecedence == true ? -PRECEDENCE : PRECEDENCE) > eA.precedence) + str[1];
    
        return new Expression(exec, typ, grouped, PRECEDENCE);
    };

    return function<T extends Exp<Args>>(a: T): AsE<Args, T> extends never ? Ambiguous : Expression<ArgTypes[AsE<Args, T>['return_type']], G extends true ? true : Grouped<AsE<Args, T>>, AsE<Args, T>['execute']> {
        return <AsE<Args, T> extends never ? Ambiguous : Expression<ArgTypes[AsE<Args, T>['return_type']], G extends true ? true : Grouped<AsE<Args, T>>, AsE<Args, T>['execute']>> func(a);
    }
};

function b2b(PRECEDENCE: number, str: string[]) {
    return function func<T extends Exp<"boolean">>(a: T): Expression<"boolean", Grouped<AsE<"boolean", T>>, AsE<"boolean", T>['execute']> {
        const eA = asE(["boolean"], a);

        const ex: ExpressionF<TableSubtype> = eA.execute;
        const grouped: Grouped<AsE<"boolean", T>> = Expression.allGrouped([eA]);
    
        const exec: AsE<"boolean", T>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            str[0] + withParentheses(ex(names, args, types)(parameters), PRECEDENCE > eA.precedence) + str[1];
    
        return new Expression(exec, "boolean", grouped, PRECEDENCE);
    };
};

function a2b(PRECEDENCE: number, str: string[]) {
    return function func<T extends Exp<SQLType>>(a: T): Expression<AsE<SQLType, T>['return_type'], Grouped<AsE<SQLType, T>>, AsE<SQLType, T>['execute']> {
        const eA = asE(<SQLType[]> Object.keys(defaultTypes), a); //WARN: Type-cast

        const ex: ExpressionF<TableSubtype> = eA.execute;
        const grouped: Grouped<AsE<SQLType, T>> = Expression.allGrouped([eA]);
    
        const exec: AsE<SQLType, T>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            str[0] + withParentheses(ex(names, args, types)(parameters), PRECEDENCE > eA.precedence) + str[1];
    
        return new Expression(exec, "boolean", grouped, PRECEDENCE);
    };
};

function aa2b(PRECEDENCE: number, str: string[]) {
    type Both<A extends Exp<SQLType>, B extends Exp<SQLType>> = MatchedExprAB<Types, SQLType, A, B> | MatchedExprAB<Types, SQLType, B, A>;
    
    return function func<A extends Exp<SQLType>, B extends Exp<SQLType>>(a: A, b: B): CorrectedCompResult<Types, A, B> {
        var possibleA = possibleTypesEx(SQLTypeSet, a, types);
        var possibleB = possibleTypesEx(SQLTypeSet, b, types);
        
        const matchedA = matchTypes(possibleA, possibleB);
        const matchedB = matchTypes(possibleB, possibleA);

        const eA: MatchedExprAB<Types, SQLType, A, B> = asET([matchedA], a, types);
        const eB: MatchedExprAB<Types, SQLType, B, A> = asET([matchedB], b, types);

        const ex1: ExpressionF<TableSubtype> = eA.execute;
        const ex2: ExpressionF<TableSubtype> = eB.execute;
    
        const exec: Both<A, B>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            str[0] + withParentheses(ex1(names, args, types)(parameters), PRECEDENCE > eA.precedence) +
            str[1] + withParentheses(ex2(names, args, types)(parameters), PRECEDENCE > eB.precedence) +
            str[2];

        const res: CompResult<Types, A, B> = new Expression(exec, "boolean", Expression.allGrouped([eA, eB]), PRECEDENCE);
    
        return <CorrectedCompResult<Types, A, B>> res;
    };
};

function aa2b3<ArgTypes extends {[key: string]: {[key2: string]: "boolean"}}, G extends boolean>(args: ArgTypes, PRECEDENCE: number, str: string[], group: G, inversePrecedence?: boolean) {
    type FS<T> = T & SQLType;

    type Args = FS<keyof ArgTypes>;
    type Args2<A extends Exp<Args>> = FS<keyof ArgTypes[RA<A>]> & Args;

    type RA<A extends Exp<Args>> = AsE<Args, A>['return_type'];

    type Both<A extends Exp<Args>, B extends Exp<Args2<A>>, C extends Exp<Args2<B>>> = AsE<Args, A> | AsE<Args2<A>, B> | AsE<Args2<B>, C>;
    
    function func<A extends Exp<Args>, B extends Exp<Args2<A>>, C extends Exp<Args2<B>>>(a: A, b: B, c: C): Expression<"boolean", G extends true ? true : Grouped<Both<A, B, C>>, Both<A, B, C>['execute']> {
        const eA = asE(<Args[]> Object.keys(args), a); //WARN: Type-cast
        const eB = asE(<Args2<A>[]> Object.keys(args[eA.return_type]), b); //WARN: Type-cast
        const eC = asE(<Args2<B>[]> Object.keys(args[eB.return_type]), c); //WARN: Type-cast

        const ex1: ExpressionF<TableSubtype> = eA.execute;
        const ex2: ExpressionF<TableSubtype> = eB.execute;
        const ex3: ExpressionF<TableSubtype> = eC.execute;
        const grouped: G extends true ? true : Grouped<Both<A, B, C>> = <G extends true ? true : Grouped<Both<A, B, C>>> (group ? true : Expression.allGrouped([eA, eB, eC])); //WARN: Type-cast
    
        const exec: Both<A, B, C>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            str[0] + withParentheses(ex1(names, args, types)(parameters), (inversePrecedence == true ? -PRECEDENCE : PRECEDENCE) > eA.precedence) +
            str[1] + withParentheses(ex2(names, args, types)(parameters), (inversePrecedence == true ? -PRECEDENCE : PRECEDENCE) > eB.precedence) +
            str[2] + withParentheses(ex3(names, args, types)(parameters), (inversePrecedence == true ? -PRECEDENCE : PRECEDENCE) > eC.precedence) +
            str[3];
    
        return new Expression(exec, "boolean", grouped, PRECEDENCE);
    };

    return function<A extends Exp<Args>, B extends Exp<Args2<A>>, C extends Exp<Args2<B>>>(a: A, b: B, c: C): AsE<Args, A> extends never ? Ambiguous : AsE<Args2<A>, B> extends never ? Ambiguous : AsE<Args2<B>, C> extends never ? Ambiguous : Expression<"boolean", G extends true ? true : Grouped<Both<A, B, C>>, Both<A, B, C>['execute']> {
        return <AsE<Args, A> extends never ? Ambiguous : AsE<Args2<A>, B> extends never ? Ambiguous : AsE<Args2<B>, C> extends never ? Ambiguous : Expression<"boolean", G extends true ? true : Grouped<Both<A, B, C>>, Both<A, B, C>['execute']>> func(a, b, c);
    };
};

const between = aa2b3<AllBools2, false>(AllBools2, 6, ["", " BETWEEN ", " AND ", ""], false);
const notBetween = aa2b3<AllBools2, false>(AllBools2, 6, ["", " NOT BETWEEN ", " AND ", ""], false);
const betweenSymmetric = aa2b3<AllBools2, false>(AllBools2, 6, ["", " BETWEEN SYMMETRIC ", " AND ", ""], false);
const notBetweenSymmetric = aa2b3<AllBools2, false>(AllBools2, 6, ["", " NOT BETWEEN SYMMETRIC ", " AND ", ""], false);

const distinct = aa2b(4, ["", " IS DISTINCT FROM ", ""]);
const notDistinct = aa2b(4, ["", " IS NOT DISTINCT FROM ", ""]);

const isNull = a2b(4, ["", " IS NULL"]);
const notNull = a2b(4, ["", " IS NOT NULL"]);
const isTrue = b2b(4, ["", " IS TRUE"]);
const notTrue = b2b(4, ["", " IS NOT TRUE"]);
const isFalse = b2b(4, ["", " IS FALSE"]);
const notFalse = b2b(4, ["", " IS NOT FALSE"]);
const isUnknown = b2b(4, ["", " IS UNKNOWN"]);
const notUnknown = b2b(4, ["", " IS NOT UNKNOWN"]);

function and<T extends Exp<"boolean">[]>(...expressions: T) {
    const PRECEDENCE = 2;

    const eE: AsE<"boolean", T[number]>[] = [];
    for (var i = 0; i < expressions.length; i++) {
        eE[i] = asE<"boolean", T[number]>(["boolean"], expressions[i]);
    }

	const exec: AsE<"boolean", T[number]>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
		eE.map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters)).join(" AND ");
	const grouped: Grouped<AsE<"boolean", T[number]>> = Expression.allGrouped<AsE<"boolean", T[number]>>(eE);
    return new Expression(exec, "boolean", grouped, PRECEDENCE);
};

function or<T extends Exp<"boolean">[]>(...expressions: T) {
    const PRECEDENCE = 1;

    const eE: AsE<"boolean", T[number]>[] = [];
    for (var i = 0; i < expressions.length; i++) {
        eE[i] = asE<"boolean", T[number]>(["boolean"], expressions[i]);
    }

	const exec: AsE<"boolean", T[number]>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
		eE.map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters)).join(" OR ");
	const grouped: Grouped<AsE<"boolean", T[number]>> = Expression.allGrouped<AsE<"boolean", T[number]>>(eE);
    return new Expression(exec, "boolean", grouped, PRECEDENCE);
};

const bitnot = expr1(NotTypes, 7, ["~", ""], false);
const not = b2b(3, ["NOT ", ""]);

const avg = expr1(AvgTypes, 99, ["AVG(", ")"], true, true);
const concat = function concat<A extends Exp<"text">, B extends Exp<"text">>(text: A, delimeter: B): Expression<"text", true, (AsE<"text", A> | AsE<"text", B>)['execute']> {
    const PRECEDENCE = 99;
    const eA = asE(["text"], text);
    const eB = asE(["text"], delimeter);

    const exA: ExpressionF<TableSubtype> = eA.execute;
    const exB: ExpressionF<TableSubtype> = eB.execute;

    const exec: (AsE<"text", A> | AsE<"text", B>)['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
        "AVG(" + withParentheses(exA(names, args, types)(parameters), -PRECEDENCE > eA.precedence) +
        "," + withParentheses(exB(names, args, types)(parameters), -PRECEDENCE > eB.precedence) +
        ")";

    return new Expression(exec, "text", true, PRECEDENCE);
};

return {between, notBetween, betweenSymmetric, notBetweenSymmetric, distinct, notDistinct, isNull, notNull, isTrue, notTrue, isFalse, notFalse, isUnknown, notUnknown, and, or, not, bitnot, avg, concat};
};
