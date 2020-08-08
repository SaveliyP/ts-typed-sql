import { Expression, ExpressionF, TableType, TableExpression, TableSubtype } from "./query_types";
import { SQLType } from "./columns";
import { TypeParser, AllTypes } from "./types";

const TypeMapping: {[key in SQLType]: string} = {
    biginteger: "BIGINT",
    binary: "BYTEA",
    boolean: "BOOLEAN",
    date: "DATE",
    datetime: "TIMESTAMP",
    enum: "VARCHAR",
    float: "FLOAT",
    integer: "INT",
    json: "JSON",
    text: "TEXT",
    time: "TIME",
    timestamp: "TIMESTAMP",
    uuid: "UUID"
};

export function identifier(id: string): string {
    return "\"" + id.replace(/"/g, "\"\"") + "\"";
}

export function addPhantomProperties<U extends boolean, V>(arg: V): V & {grouped: U} {
    return arg as V & {grouped: U};
}

export function expres<T extends SQLType, U extends boolean, E extends ExpressionF<TableSubtype>>(expr: E, type: T, precedence: number): Expression<T, U, E> {
    return addPhantomProperties({
        execute: expr,
        return_type: type,
        precedence: precedence
    });
}

export function expressionWithParentheses<Types extends AllTypes>(precedence: number, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>, parameters: TableSubtype) {
    return function(x: Expression<SQLType, boolean, ExpressionF<TableSubtype>>): string {
        return withParentheses(x.execute(names, args, types)(parameters), precedence > x.precedence);
    }
}

export const parameters: {[key in SQLType]: <K extends string>(id: K) => Expression<key, true, ExpressionF<{[key2 in K]: key}>>} = {
    biginteger: <K extends string>(id: K) => $(id, "biginteger"),
    binary: <K extends string>(id: K) => $(id, "binary"),
    boolean: <K extends string>(id: K) => $(id, "boolean"),
    date: <K extends string>(id: K) => $(id, "date"),
    datetime: <K extends string>(id: K) => $(id, "datetime"),
    enum: <K extends string>(id: K) => $(id, "enum"),
    float: <K extends string>(id: K) => $(id, "float"),
    integer: <K extends string>(id: K) => $(id, "integer"),
    json: <K extends string>(id: K) => $(id, "json"),
    text: <K extends string>(id: K) => $(id, "text"),
    time: <K extends string>(id: K) => $(id, "time"),
    timestamp: <K extends string>(id: K) => $(id, "timestamp"),
    uuid: <K extends string>(id: K) => $(id, "uuid"),
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
    return addPhantomProperties({
        execute: exec,
        return_type: type,
        precedence: 99
    });
}

export const literals: {[key in SQLType]: (value: string | null) => Expression<key, true, ExpressionF<{}>>} = {
    biginteger: value => raw(value, "biginteger"),
    binary: value => raw(value, "binary"),
    boolean: value => raw(value, "boolean"),
    date: value => raw(value, "date"),
    datetime: value => raw(value, "datetime"),
    enum: value => raw(value, "enum"),
    float: value => raw(value, "float"),
    integer: value => raw(value, "integer"),
    json: value => raw(value, "json"),
    text: value => raw(value, "text"),
    time: value => raw(value, "time"),
    timestamp: value => raw(value, "timestamp"),
    uuid: value => raw(value, "uuid"),
};

export function raw<T extends SQLType>(value: string | null, type: T): Expression<T, true, ExpressionF<{}>> {
    var exec = function(names: {[key: string]: number}, args: unknown[]) {
        args.push(value);
        const id = args.length;
        return function(parameters: {}) {
            return "CAST ($" + id + " AS " + TypeMapping[type] + ")";
        }
    }
    return addPhantomProperties({
        execute: exec,
        return_type: type,
        precedence: 99
    });
}

export function cast<T extends Expression<SQLType, boolean, ExpressionF<TableSubtype>>, U extends SQLType>(value: T, to: U): Expression<U, T['grouped'], T['execute']> {
    var exec: T['execute'] = (names, args, types) => parameters => "CAST (" + value.execute(names, args, types)(parameters) + " AS " + TypeMapping[to] + ")";
    return addPhantomProperties({
        execute: exec,
        return_type: to,
        precedence: 99
    });
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
        var expr: TableExpression<T, ExpressionF<{}>> = <any> {}; //TODO: <any>
        for (let key in columns) {
            expr[key] = expres(() => () => identifier(alias) + "." + identifier(key), columns[key].return_type, 99);
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

export function overwrite<T extends {}, U extends {}>(obj: T, obj2: U): {[key in Exclude<keyof T, keyof U>]: T[key]} & U {
    return {...obj, ...obj2};
}

export function replace<T extends {}, K extends keyof T, U extends any>(obj: T, key: K, target: U): {[key in keyof T]: key extends K ? (K extends key ? U : T[key]) : T[key]} {
    return  <any> {...omit(obj, key), [key]: target}; //TODO: remove <any>
}
