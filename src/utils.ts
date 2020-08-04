import { Expression, ExpressionF, TableType, TableExpression } from "./query_types";
import { SQLType } from "./columns";

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

export function expres<T extends SQLType, U extends boolean, E extends ExpressionF<never>>(expr: E, type: T, precedence: number): Expression<T, U, E> {
    return addPhantomProperties({
        execute: expr,
        return_type: type,
        precedence: precedence
    });
}

export function expressionWithParentheses(precedence: number, names: {[key: string]: number}, args: unknown[], parameters: never): ((x: Expression<SQLType, boolean, ExpressionF<never>>) => string) {
    return x => withParentheses(x.execute(names, args)(parameters), precedence > x.precedence);
}

export const $text = <K extends string>(id: K) => $(id, "text");
export const $float = <K extends string>(id: K) => $(id, "float");
export const $int = <K extends string>(id: K) => $(id, "integer");
export const $bigint = <K extends string>(id: K) => $(id, "biginteger");
export const $boolean = <K extends string>(id: K) => $(id, "boolean");
export const $date = <K extends string>(id: K) => $(id, "date");

export function $<T extends SQLType, K extends string>(id: K, type: T): Expression<T, true, ExpressionF<{[key in K]: T}>> {
    var exec = function(names: {[key: string]: number}, args: unknown[]) {
        return function(parameters: {[key in K]: T}) {
            if (names[id] == null) {
                args.push(parameters[id]);
                names[id] = args.length;
            }

            return "$" + names[id];
        }
    }
    return addPhantomProperties({
        execute: exec,
        return_type: type,
        precedence: 99
    });
}

export const literals: {[key in SQLType]: (value: string) => Expression<key, true, ExpressionF<{}>>} = {
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

export function raw<T extends SQLType>(value: string, type: T): Expression<T, true, ExpressionF<{}>> {
    var exec = function(names: {[key: string]: number}, args: unknown[]) {
        const id = args.length;
        args.push(value);
        return function(parameters: {}) {
            return TypeMapping[type] + " $" + id;
        }
    }
    return addPhantomProperties({
        execute: exec,
        return_type: type,
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

export function createTableExpression<T extends TableType>(columns: {[key in keyof T]: Expression<T[key], boolean, ExpressionF<never>>}): (alias: string) => TableExpression<T, ExpressionF<{}>> {
    return function ColumnExpressions(alias: string): TableExpression<T, ExpressionF<{}>> {
        var expr: TableExpression<T, ExpressionF<{}>> = <any> {}; //TODO: <any>
        for (let key in columns) {
            expr[key] = expres(() => () => identifier(alias) + "." + identifier(key), columns[key].return_type, 99);
        }
        return expr;
    }
}

export function createTableProvider<T extends TableType, P extends ExpressionF<never>>(columns: (alias: string) => TableExpression<T, ExpressionF<{}>>, AsTableExpression: P) {
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

export function replace<T extends {}, K extends keyof T, U extends any>(obj: T, key: K, target: U): {[key in keyof T]: key extends K ? (K extends key ? U : T[key]) : T[key]} {
    return  <any> {...omit(obj, key), [key]: target}; //TODO: remove <any>
}
