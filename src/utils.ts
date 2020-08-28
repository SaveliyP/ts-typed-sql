import { Expression, ExpressionF, TableType, TableExpression, TableSubtype, Grouped } from "./query_types";
import { SQLType } from "./columns";
import { TypeParser, AllTypes } from "./types";

export const TypeMapping: {[key in SQLType]: string} = {
    smallint: "SMALLINT",
    integer: "INT",
    bigint: "BIGINT",
    float: "FLOAT",
    double: "DOUBLE PRECISION",
    numeric: "NUMERIC",

    boolean: "BOOLEAN",
    bit: "BIT",
    binary: "BYTEA",

    text: "TEXT",
    enum: "VARCHAR",

    json: "JSON",

    time: "TIME",
    date: "DATE",
    timestamp: "TIMESTAMP",
};

export function identifier(id: string): string {
    return "\"" + id.replace(/"/g, "\"\"") + "\"";
}

export function expressionWithParentheses<Types extends AllTypes>(precedence: number, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>, parameters: TableSubtype) {
    return function(x: Expression<SQLType, boolean, ExpressionF<TableSubtype>>): string {
        return withParentheses(x.execute(names, args, types)(parameters), precedence > x.precedence);
    }
}

export const parameters: {[key in SQLType]: <K extends string>(id: K) => Expression<key, true, ExpressionF<{[key2 in K]: key}>>} = {
    smallint: <K extends string>(id: K) => $(id, "smallint"),
    integer: <K extends string>(id: K) => $(id, "integer"),
    bigint: <K extends string>(id: K) => $(id, "bigint"),
    float: <K extends string>(id: K) => $(id, "float"),
    double: <K extends string>(id: K) => $(id, "double"),
    numeric: <K extends string>(id: K) => $(id, "numeric"),

    boolean: <K extends string>(id: K) => $(id, "boolean"),
    bit: <K extends string>(id: K) => $(id, "bit"),
    binary: <K extends string>(id: K) => $(id, "binary"),

    text: <K extends string>(id: K) => $(id, "text"),
    enum: <K extends string>(id: K) => $(id, "enum"),

    json: <K extends string>(id: K) => $(id, "json"),

    time: <K extends string>(id: K) => $(id, "time"),
    date: <K extends string>(id: K) => $(id, "date"),
    timestamp: <K extends string>(id: K) => $(id, "timestamp"),
}

export function $<T extends SQLType, K extends string>(id: K, type: T): Expression<T, true, ExpressionF<{[key in K]: T}>> {
    var exec = function<Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) {
        return function(parameters: {[key in K]: Types[T] | null}) {
            if (names[id] == null) {
                args.push(parameters[id] == null ? null : types[type].toSQL(parameters[id]));
                names[id] = args.length;
            }

            return "CAST ($" + names[id] + " AS " + TypeMapping[type] + ")";
        }
    }

    return new Expression(exec, type, true, 99);
}

export function cast<T extends Expression<SQLType, boolean, ExpressionF<TableSubtype>>, U extends SQLType>(value: T, to: U): Expression<U, Grouped<T>, T['execute']> {
    var exec: T['execute'] = (names, args, types) => parameters => "CAST (" + value.execute(names, args, types)(parameters) + " AS " + TypeMapping[to] + ")";
    return new Expression(exec, to, Expression.allGrouped([value]), 99);
}

export function withParentheses(a: string, parentheses: boolean): string {
    if (parentheses) {
        return "(" + a + ")";
    } else {
        return a;
    }
}

export function createTableExpression<T extends TableType>(columns: {[key in keyof T]: Expression<T[key], boolean, ExpressionF<TableSubtype>>}): (alias: string) => TableExpression<T, ExpressionF<{}>> {
    return function ColumnExpressions(alias: string): TableExpression<T, ExpressionF<{}>> {
        var expr: TableExpression<T, ExpressionF<{}>> = <any> {}; //WARN: Type-cast
        for (let key in columns) {
            expr[key] = new Expression(() => () => identifier(alias) + "." + identifier(key), columns[key].return_type, false, 99);
        }
        return expr;
    }
}

export function createTableProvider<T extends TableType, P extends ExpressionF<TableSubtype>>(columns: (alias: string) => TableExpression<T, ExpressionF<{}>>, AsTableExpression: P) {
    function Statement(): P;
    function Statement(alias: string): TableExpression<T, ExpressionF<{}>>;
    function Statement(alias?: string): TableExpression<T, ExpressionF<{}>> | P {
        if (alias == null) {
            return AsTableExpression;
        } else {
            return columns(alias);
        }
    }
    return (function<U>(a: U): U & {type: T, parameters: P} {return <any> a;})(Statement);
}

//https://stackoverflow.com/questions/53966509/typescript-type-safe-omit-function
function omit<T extends object, K extends [...(keyof T)[]]>(obj: T, ...keys: K): {
    [K2 in Exclude<keyof T, K[number]>]: T[K2]
} {
    let ret = {} as {
        [K in keyof T]: T[K]
    };
    let key: keyof T;
    for (key in obj) {
        if (!(keys.includes(key))) {
            ret[key] = obj[key];
        }
    }
    return ret;
}

export function sqlmap<T extends {[key: string]: SQLType}>(x: T): T {
    return x;
}

export function replace<T extends {}, K extends keyof T, U extends any>(obj: T, key: K, target: U): {[key in keyof T]: key extends K ? (K extends key ? U : T[key]) : T[key]} {
    return  <any> {...omit(obj, key), [key]: target}; //WARN: Type-cast
}
