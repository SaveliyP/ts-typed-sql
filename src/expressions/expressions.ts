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

const Categories = sqlmap({
    "smallint": "numeric",
    "integer": "numeric",
    "bigint": "numeric",
    "float": "numeric",
    "double": "numeric",
    "numeric": "numeric",

    "boolean": "boolean",
    "bit": "bit",
    "binary": "binary",

    "text": "text",

    "enum": "enum",
    "json": "json",

    "time": "time",
    "date": "timestamp",
    "timestamp": "timestamp"
});
type Categories = {[key in keyof typeof Categories]: (typeof Categories)[key]};
type AllowedComparisons = {[key in keyof Categories]: {[key2 in keyof Categories]: Categories[key2] extends Categories[key] ? key2 : never}[keyof Categories]};
const AllowedTypes: {[key in keyof AllowedComparisons]: AllowedComparisons[key][]} = {
    "smallint": ["smallint", "integer", "bigint", "float", "double", "numeric"],
    "integer": ["smallint", "integer", "bigint", "float", "double", "numeric"],
    "bigint": ["smallint", "integer", "bigint", "float", "double", "numeric"],
    "float": ["smallint", "integer", "bigint", "float", "double", "numeric"],
    "double": ["smallint", "integer", "bigint", "float", "double", "numeric"],
    "numeric": ["smallint", "integer", "bigint", "float", "double", "numeric"],

    "boolean": ["boolean"],
    "bit": ["bit"],
    "binary": ["binary"],

    "text": ["text"],

    "enum": ["enum"],
    "json": ["json"],

    "time": ["time"],
    "date": ["date", "timestamp"],
    "timestamp": ["date", "timestamp"]
};

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

type Expr1Ret<Types extends AllTypes, ArgTypes extends {[key: string]: SQLType}, G extends boolean> = <T extends Expr<keyof ArgTypes & SQLType, Types>>(a: T) => AsET<Types, keyof ArgTypes & SQLType, T> extends never ? Ambiguous : Expression<ArgTypes[AsET<Types, keyof ArgTypes & SQLType, T>['return_type']], G extends true ? true : Grouped<AsET<Types, keyof ArgTypes & SQLType, T>>, AsET<Types, keyof ArgTypes & SQLType, T>['execute']>;
function expr1<Types extends AllTypes, ArgTypes extends {[key: string]: SQLType}, G extends boolean>(types: TypeParser<Types>, args: ArgTypes, PRECEDENCE: number, str: string[], group: G, inversePrecedence?: boolean): Expr1Ret<Types, ArgTypes, G> {
    type FS<T> = T & SQLType;
    type Args = FS<keyof ArgTypes>;
    function func<T extends Expr<Args, Types>>(a: T): Expression<ArgTypes[AsET<Types, Args, T>['return_type']], G extends true ? true : Grouped<AsET<Types, Args, T>>, AsET<Types, Args, T>['execute']> {
        const eA = asET(<Args[]> Object.keys(args), a, types); //WARN: Type-cast

        const typ: ArgTypes[AsET<Types, Args, T>['return_type']] = args[eA.return_type];
        const ex: ExpressionF<TableSubtype> = eA.execute;
        const grouped: G extends true ? true : Grouped<AsET<Types, Args, T>> = <G extends true ? true : Grouped<AsET<Types, Args, T>>> (group ? true : Expression.allGrouped([eA])); //WARN: Type-cast
    
        const exec: AsET<Types, Args, T>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            str[0] + withParentheses(ex(names, args, types)(parameters), (inversePrecedence == true ? -PRECEDENCE : PRECEDENCE) > eA.precedence) + str[1];
    
        return new Expression(exec, typ, grouped, PRECEDENCE);
    };

    return function<T extends Expr<Args, Types>>(a: T): AsET<Types, Args, T> extends never ? Ambiguous : Expression<ArgTypes[AsET<Types, Args, T>['return_type']], G extends true ? true : Grouped<AsET<Types, Args, T>>, AsET<Types, Args, T>['execute']> {
        return <AsET<Types, Args, T> extends never ? Ambiguous : Expression<ArgTypes[AsET<Types, Args, T>['return_type']], G extends true ? true : Grouped<AsET<Types, Args, T>>, AsET<Types, Args, T>['execute']>> func(a);
    }
}

type B2BRet<Types extends AllTypes> = <T extends Expr<"boolean", Types>>(a: T) => Expression<"boolean", Grouped<AsET<Types, "boolean", T>>, AsET<Types, "boolean", T>['execute']>;
function b2b<Types extends AllTypes>(types: TypeParser<Types>, PRECEDENCE: number, str: string[]): B2BRet<Types> {
    return function func<T extends Expr<"boolean", Types>>(a: T): Expression<"boolean", Grouped<AsET<Types, "boolean", T>>, AsET<Types, "boolean", T>['execute']> {
        const eA = asET(["boolean"], a, types);

        const ex: ExpressionF<TableSubtype> = eA.execute;
        const grouped: Grouped<AsET<Types, "boolean", T>> = Expression.allGrouped([eA]);
    
        const exec: AsET<Types, "boolean", T>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            str[0] + withParentheses(ex(names, args, types)(parameters), PRECEDENCE > eA.precedence) + str[1];
    
        return new Expression(exec, "boolean", grouped, PRECEDENCE);
    };
}

type A2BRet<Types extends AllTypes> = <T extends Expr<SQLType, Types>>(a: T) => Expression<AsET<Types, SQLType, T>['return_type'], Grouped<AsET<Types, SQLType, T>>, AsET<Types, SQLType, T>['execute']>;
function a2b<Types extends AllTypes>(types: TypeParser<Types>, PRECEDENCE: number, str: string[]): A2BRet<Types> {
    return function func<T extends Expr<SQLType, Types>>(a: T): Expression<AsET<Types, SQLType, T>['return_type'], Grouped<AsET<Types, SQLType, T>>, AsET<Types, SQLType, T>['execute']> {
        const eA = asET(<SQLType[]> Object.keys(defaultTypes), a, types); //WARN: Type-cast

        const ex: ExpressionF<TableSubtype> = eA.execute;
        const grouped: Grouped<AsET<Types, SQLType, T>> = Expression.allGrouped([eA]);
    
        const exec: AsET<Types, SQLType, T>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            str[0] + withParentheses(ex(names, args, types)(parameters), PRECEDENCE > eA.precedence) + str[1];
    
        return new Expression(exec, "boolean", grouped, PRECEDENCE);
    };
}

type AA2BRet<Types extends AllTypes> = <A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>>(a: A, b: B) => CorrectedCompResult<Types, A, B>;
function aa2b<Types extends AllTypes>(types: TypeParser<Types>, PRECEDENCE: number, str: string[]) {
    type Both<A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>> = MatchedExprAB<Types, SQLType, A, B> | MatchedExprAB<Types, SQLType, B, A>;
    
    return function func<A extends Expr<SQLType, Types>, B extends Expr<SQLType, Types>>(a: A, b: B): CorrectedCompResult<Types, A, B> {
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
}

/*type AA2B3Ret<Types extends AllTypes, ArgTypes extends {[key: string]: {[key2: string]: "boolean"}}, G extends boolean> = <A extends Expr<keyof ArgTypes & SQLType, Types>, B extends Expr<Args2<A>, Types>, C extends Expr<Args2<B>, Types>>(a: A, b: B, c: C) => AsET<Types, keyof ArgTypes & SQLType, A> extends never ? Ambiguous : AsET<Types, Args2<A>, B> extends never ? Ambiguous : AsET<Types, Args2<B>, C> extends never ? Ambiguous : Expression<"boolean", G extends true ? true : Grouped<Both<A, B, C>>, Both<A, B, C>['execute']>;
function aa2b3<Types extends AllTypes, ArgTypes extends {[key: string]: {[key2: string]: "boolean"}}, G extends boolean>(types: TypeParser<Types>, args: ArgTypes, PRECEDENCE: number, str: string[], group: G, inversePrecedence?: boolean) {
    type FS<T> = T & SQLType;

    type Args = FS<keyof ArgTypes>;
    type Args2<A extends Expr<Args, Types>> = FS<keyof ArgTypes[RA<A>]> & Args;

    type RA<A extends Expr<Args, Types>> = AsET<Types, Args, A>['return_type'];

    type Both<A extends Expr<Args, Types>, B extends Expr<Args2<A>, Types>, C extends Expr<Args2<B>, Types>> = AsET<Types, Args, A> | AsET<Types, Args2<A>, B> | AsET<Types, Args2<B>, C>;
    
    function func<A extends Expr<Args, Types>, B extends Expr<Args2<A>, Types>, C extends Expr<Args2<B>, Types>>(a: A, b: B, c: C): Expression<"boolean", G extends true ? true : Grouped<Both<A, B, C>>, Both<A, B, C>['execute']> {
        const eA = asET(<Args[]> Object.keys(args), a, types); //WARN: Type-cast
        const eB = asET(<Args2<A>[]> Object.keys(args[eA.return_type]), b, types); //WARN: Type-cast
        const eC = asET(<Args2<B>[]> Object.keys(args[eB.return_type]), c, types); //WARN: Type-cast

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

    return function<A extends Expr<Args, Types>, B extends Expr<Args2<A>, Types>, C extends Expr<Args2<B>, Types>>(a: A, b: B, c: C): AsET<Types, Args, A> extends never ? Ambiguous : AsET<Types, Args2<A>, B> extends never ? Ambiguous : AsET<Types, Args2<B>, C> extends never ? Ambiguous : Expression<"boolean", G extends true ? true : Grouped<Both<A, B, C>>, Both<A, B, C>['execute']> {
        return <AsET<Types, Args, A> extends never ? Ambiguous : AsET<Types, Args2<A>, B> extends never ? Ambiguous : AsET<Types, Args2<B>, C> extends never ? Ambiguous : Expression<"boolean", G extends true ? true : Grouped<Both<A, B, C>>, Both<A, B, C>['execute']>> func(a, b, c);
    };
}

function aa2b31<Types extends AllTypes, G extends boolean>(types: TypeParser<Types>, PRECEDENCE: number, str: string[], group: G, inversePrecedence?: boolean) {
    type FS<T> = T & SQLType;

    type Args2<A extends Expr<SQLType, Types>> = FS<keyof ArgTypes[RA<A>]>;

    type RA<A extends Expr<SQLType, Types>> = AsET<Types, SQLType, A>['return_type'];

    type Both<A extends Expr<SQLType, Types>, B extends Expr<Args2<A>, Types>, C extends Expr<Args2<B>, Types>> = AsET<Types, SQLType, A> | AsET<Types, Args2<A>, B> | AsET<Types, Args2<B>, C>;
    
    function func<A extends Expr<SQLType, Types>, B extends Expr<Args2<A>, Types>, C extends Expr<Args2<B>, Types>>(a: A, b: B, c: C): Expression<"boolean", G extends true ? true : Grouped<Both<A, B, C>>, Both<A, B, C>['execute']> {
        const eA = asET(<SQLType[]> Object.keys(Categories), a, types); //WARN: Type-cast
        const eB = asET<Types, AllowedComparisons[AsET<Types, SQLType, A>['return_type']], B>(AllowedTypes[eA.return_type], b, types); //WARN: Type-cast
        const eC = asET(<Args2<B>[]> Object.keys(args[eB.return_type]), c, types); //WARN: Type-cast

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

    return function<A extends Expr<SQLType, Types>, B extends Expr<Args2<A>, Types>, C extends Expr<Args2<B>, Types>>(a: A, b: B, c: C): AsET<Types, SQLType, A> extends never ? Ambiguous : AsET<Types, Args2<A>, B> extends never ? Ambiguous : AsET<Types, Args2<B>, C> extends never ? Ambiguous : Expression<"boolean", G extends true ? true : Grouped<Both<A, B, C>>, Both<A, B, C>['execute']> {
        return <AsET<Types, SQLType, A> extends never ? Ambiguous : AsET<Types, Args2<A>, B> extends never ? Ambiguous : AsET<Types, Args2<B>, C> extends never ? Ambiguous : Expression<"boolean", G extends true ? true : Grouped<Both<A, B, C>>, Both<A, B, C>['execute']>> func(a, b, c);
    };
}*/

export class TypeSQLExpressions<Types extends AllTypes> {
    private types: TypeParser<Types>;

    constructor(types: TypeParser<Types>) {
        this.types = types;

        //this.between
        //this.notBetween
        //this.betweenSymmetric
        //this.notBetweenSymmetric
        this.distinct = aa2b(this.types, 4, ["", " IS DISTINCT FROM ", ""]);
        this.notDistinct = aa2b(this.types, 4, ["", " IS NOT DISTINCT FROM ", ""]);
        this.isNull = a2b(this.types, 4, ["", " IS NULL"]);
        this.notNull = a2b(this.types, 4, ["", " IS NOT NULL"]);
        this.isTrue = b2b(this.types, 4, ["", " IS TRUE"]);
        this.notTrue = b2b(this.types, 4, ["", " IS NOT TRUE"]);
        this.isFalse = b2b(this.types, 4, ["", " IS FALSE"]);
        this.notFalse = b2b(this.types, 4, ["", " IS NOT FALSE"]);
        this.isUnknown = b2b(this.types, 4, ["", " IS UNKNOWN"]);
        this.notUnknown = b2b(this.types, 4, ["", " IS NOT UNKNOWN"]);
        this.bitnot = expr1(this.types, NotTypes, 7, ["~", ""], false);
        this.not = b2b(this.types, 3, ["NOT ", ""]);
        this.avg = expr1(this.types, AvgTypes, 99, ["AVG(", ")"], true, true);
    }

//    between = aa2b3<Types, AllBools2, false>(this.types, AllBools2, 6, ["", " BETWEEN ", " AND ", ""], false);
//    notBetween = aa2b3<Types, AllBools2, false>(this.types, AllBools2, 6, ["", " NOT BETWEEN ", " AND ", ""], false);
//    betweenSymmetric = aa2b3<Types, AllBools2, false>(this.types, AllBools2, 6, ["", " BETWEEN SYMMETRIC ", " AND ", ""], false);
//    notBetweenSymmetric = aa2b3<Types, AllBools2, false>(this.types, AllBools2, 6, ["", " NOT BETWEEN SYMMETRIC ", " AND ", ""], false);

    distinct: AA2BRet<Types>;
    notDistinct: AA2BRet<Types>;

    isNull: A2BRet<Types>;
    notNull: A2BRet<Types>;
    isTrue: B2BRet<Types>;
    notTrue: B2BRet<Types>;
    isFalse: B2BRet<Types>;
    notFalse: B2BRet<Types>;
    isUnknown: B2BRet<Types>;
    notUnknown: B2BRet<Types>;

    and<T extends Expr<"boolean", Types>[]>(...expressions: T) {
        const PRECEDENCE = 2;

        const eE: AsET<Types, "boolean", T[number]>[] = [];
        for (var i = 0; i < expressions.length; i++) {
            eE[i] = asET<Types, "boolean", T[number]>(["boolean"], expressions[i], this.types);
        }

        const exec: AsET<Types, "boolean", T[number]>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            eE.map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters)).join(" AND ");
        const grouped: Grouped<AsET<Types, "boolean", T[number]>> = Expression.allGrouped<AsET<Types, "boolean", T[number]>>(eE);
        return new Expression(exec, "boolean", grouped, PRECEDENCE);
    };

    or<T extends Expr<"boolean", Types>[]>(...expressions: T) {
        const PRECEDENCE = 1;

        const eE: AsET<Types, "boolean", T[number]>[] = [];
        for (var i = 0; i < expressions.length; i++) {
            eE[i] = asET<Types, "boolean", T[number]>(["boolean"], expressions[i], this.types);
        }

        const exec: AsET<Types, "boolean", T[number]>['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            eE.map(expressionWithParentheses(PRECEDENCE, names, args, types, parameters)).join(" OR ");
        const grouped: Grouped<AsET<Types, "boolean", T[number]>> = Expression.allGrouped<AsET<Types, "boolean", T[number]>>(eE);
        return new Expression(exec, "boolean", grouped, PRECEDENCE);
    };

    bitnot: Expr1Ret<Types, typeof NotTypes, false>;
    not: B2BRet<Types>;

    avg: Expr1Ret<Types, typeof AvgTypes, true>;
    concat<A extends Expr<"text", Types>, B extends Expr<"text", Types>>(text: A, delimeter: B): Expression<"text", true, (AsET<Types, "text", A> | AsET<Types, "text", B>)['execute']> {
        const PRECEDENCE = 99;
        const eA = asET(["text"], text, this.types);
        const eB = asET(["text"], delimeter, this.types);

        const exA: ExpressionF<TableSubtype> = eA.execute;
        const exB: ExpressionF<TableSubtype> = eB.execute;

        const exec: (AsET<Types, "text", A> | AsET<Types, "text", B>)['execute'] = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: TableSubtype) =>
            "AVG(" + withParentheses(exA(names, args, types)(parameters), -PRECEDENCE > eA.precedence) +
            "," + withParentheses(exB(names, args, types)(parameters), -PRECEDENCE > eB.precedence) +
            ")";

        return new Expression(exec, "text", true, PRECEDENCE);
    };
}
