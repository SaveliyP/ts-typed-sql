import { SQLType } from "../columns";
import { Expression, ExpressionF, TableSubtype } from "../query_types";
import { AllTypes, TypeParser } from "../types";
import { TypeMapping } from "../utils";

export type FixedPointSQLTypes = "smallint" | "integer" | "bigint" | "numeric";
export type NumericSQLTypes = FixedPointSQLTypes | "float" | "double";
export const FixedPointTypeSet: Set<FixedPointSQLTypes> = new Set(["smallint", "integer", "bigint", "numeric"]);
export const NumericTypeSet: Set<NumericSQLTypes> = new Set(["smallint", "integer", "bigint", "numeric", "float", "double"]);
export const SQLTypeSet: Set<SQLType> = new Set<SQLType>(["smallint", "integer", "bigint", "float", "double", "numeric", "boolean", "bit", "binary", "text", "enum", "json", "time", "date", "timestamp"]);

//Force the TypeScript tooltip thing to fully write out the generated types instead of writing Values<...>
type ForceCalc<T> = T extends any ? T : never;
type Values<T> = ForceCalc<T[keyof T]>;

export type FindTypes<Types extends AllTypes, A extends SQLType, T extends Types[A]> = Values<{[key in A]: T extends Types[key] ? key : never}>;

export type Ambiguous = "Ambiguous types. You might need to add explicitly typed literals.";
export const Ambiguous: Ambiguous = "Ambiguous types. You might need to add explicitly typed literals.";

export function possibleTypes<Types extends AllTypes, A extends SQLType, T extends Types[A]>(allowed: Set<A>, x: T, types: TypeParser<Types>): FindTypes<Types, A, T>[] {
    var possible: FindTypes<Types, A, T>[] = [];

    var key: keyof TypeParser<Types>;
    for (key in types) {
        if (types[key].isT(x) && allowed.has(<A> key)) { //WARN: Type-cast
            possible.push(<FindTypes<Types, A, T>> key);
        }
    }

    return possible;
}

export type FindTypesEx<Types extends AllTypes, A extends SQLType, T extends Expr<A, Types>> = T extends Expression<SQLType, boolean, ExpressionF<TableSubtype>> ? T['return_type'] : {[key in A]: T extends Types[key] ? key : never}[A];
export function possibleTypesEx<Types extends AllTypes, A extends SQLType, T extends Expr<A, Types>>(allowed: Set<A>, x: T, types: TypeParser<Types>): FindTypesEx<Types, A, T>[] {
    if (x instanceof Expression) {
        return <FindTypesEx<Types, A, T>[]> [x.return_type]; //WARN: Type-cast
    } else {
        return <FindTypesEx<Types, A, T>[]> <unknown> possibleTypes(allowed, x, types); //WARN: Type-cast
    }
}

export type MatchType<TypesA extends SQLType, TypesB extends SQLType> = (UnionToIntersection<TypesA> extends never ? (TypesA & UnionToIntersection<TypesB>) : TypesA) & SQLType;
export function matchTypes<A extends SQLType, B extends SQLType>(a: A[], b: B[]): MatchType<A, B> {
    if (a.length == 1) {
        return <MatchType<A, B>> a[0];
    } else if (b.length == 1) {
        for (var i = 0; i < a.length; i++) {
            if (<string> a[i] == <string> b[0]) {
                return <MatchType<A, B>> b[0];
            }
        }
        
        throw Error(Ambiguous);
    } else {
        throw Error(Ambiguous);
    }
}

export type TypeGroup = {
    smallint: "numeric",
    integer: "numeric",
    bigint: "numeric",
    float: "numeric",
    double: "numeric",
    numeric: "numeric",
    boolean: "boolean",
    bit: "bit",
    binary: "binary",
    text: "text",
    enum: "enum",
    json: "json",
    time: "time",
    date: "timestamp",
    timestamp: "timestamp",
};

export function raw<Types extends AllTypes, T extends SQLType>(value: Types[T] | null, type: T, types: TypeParser<Types>): Expression<T, true, ExpressionF<{}>> {
    const exec = function(names: {[key: string]: number}, args: unknown[]) {
        args.push(value == null ? null : types[type].toSQL(value));
        const id = args.length;
        return function(parameters: {}) {
            return "CAST ($" + id + " AS " + TypeMapping[type] + ")";
        }
    };

    return new Expression(exec, type, true, 99);
}

//https://stackoverflow.com/questions/50374908/transform-union-type-to-intersection-type
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

type FST<A extends SQLType, T> = T extends A ? T : never;
export type ToType<Types extends AllTypes, A extends SQLType, T extends Types[A]> = FST<A, UnionToIntersection<FindTypes<Types, A, T>>>;

type ToEx<Types extends AllTypes, A extends SQLType, T extends Types[A]> = ToType<Types, A, T> extends never ? never : Expression<ToType<Types, A, T>, true, ExpressionF<{}>>;
function convert<Types extends AllTypes, A extends SQLType, T extends Types[A]>(allowed: A[], x: T, types: TypeParser<Types>): ToEx<Types, A, T> {
    var allowedSet = new Set<A>();
    allowed.forEach(x => allowedSet.add(x));

    var finalSet: FindTypes<Types, A, T>[] = possibleTypes(allowedSet, x, types);

    if (finalSet.length != 1) {
        throw Error(Ambiguous);
    } else {
        var finalType: ToType<Types, A, T> = <ToType<Types, A, T>> <unknown> finalSet[0]; //WARN: Type-cast
        return <any> raw(x, finalType, types); //WARN: Type-cast
    }
}

export type AsET<Types extends AllTypes, A extends SQLType, T extends Types[A] | Expression<A, boolean, ExpressionF<TableSubtype>>> = T extends Expression<A, boolean, ExpressionF<TableSubtype>> ? T : ToEx<Types, A, T>;

export function asET<Types extends AllTypes, A extends SQLType, T extends Types[A] | Expression<A, boolean, ExpressionF<TableSubtype>>>(allowed: A[], x: T, types: TypeParser<Types>): AsET<Types, A, T> {
    return <AsET<Types, A, T>> ((x instanceof Expression) ? x : convert(allowed, x, types)); //WARN: Type-cast
}

export type Expr<T extends SQLType, Types extends AllTypes> = Expression<T, boolean, ExpressionF<TableSubtype>> | Types[T];