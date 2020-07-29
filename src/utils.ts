import { Expression, SQLType, JSONType, ExpressionF, TableType, TableExpression } from "./query_types";

export function identifier(id: string): string {
    return "\"" + id.replace(/"/g, "\"\"") + "\"";
}

export function addPhantomProperties<T extends SQLType, U extends boolean, V>(arg: V): V & {grouped: U, return_type: T} {
    return arg as V & {grouped: U, return_type: T};
}

export function expression<T extends SQLType, U extends boolean, E extends Expression<SQLType, boolean, ExpressionF<never>>[]>(expr: E, precedence: number): Expression<T, U, E[number]['execute']> {
    var exec: E[number]['execute'] = function(names, args) {
        const exprM = expr.map(x => ({precedence: x.precedence, execute: x.execute(names, args)}));

        return (parameters) => exprM.map(x => {
            if (precedence > x.precedence) {
                return "(" + x.execute(parameters) + ")";
            } else {
                return x.execute(parameters);
            }
        }).join("");
    }
    return addPhantomProperties({
        execute: exec,
        precedence: precedence
    });
}

export function expres<T extends SQLType, U extends boolean, E extends ExpressionF<never>>(expr: E, precedence: number): Expression<T, U, E> {
    return addPhantomProperties({
        execute: expr,
        precedence: precedence
    });
}

export function mapRawExpression(precedence: number, parameters: never, names: {[key: string]: number}, args: SQLType[]): ((x: SQLType | Expression<SQLType, boolean, ExpressionF<never>>) => string) {
    return x => {
        const y = rawOrExpression(x);
        return withParentheses(y.execute(names, args)(parameters), precedence > y.precedence);
    };
}

function r(value: SQLType): Expression<SQLType, true, ExpressionF<{}>> {
    var exec = function(names: {[key: string]: number}, args: SQLType[]) {
        args.push(value);
        const pId = args.length;
        return (parameters: {}) => "$" + pId;
    }

    return addPhantomProperties({
        execute: exec,
        precedence: 99
    });
}

export function raw(value: string): Expression<string, true, ExpressionF<{}>>;
export function raw(value: number): Expression<number, true, ExpressionF<{}>>;
export function raw(value: boolean): Expression<boolean, true, ExpressionF<{}>>;
export function raw(value: boolean[]): Expression<boolean[], true, ExpressionF<{}>>; //TODO: this needs to be done differently
export function raw(value: Buffer): Expression<Buffer, true, ExpressionF<{}>>;
export function raw(value: bigint): Expression<bigint, true, ExpressionF<{}>>;
export function raw(value: Date): Expression<Date, true, ExpressionF<{}>>;
export function raw(value: JSONType): Expression<JSONType, true, ExpressionF<{}>>;
export function raw(value: SQLType): Expression<SQLType, true, ExpressionF<{}>> {
    return r(value);
}

export function $s<K extends string>(id: K): Expression<string, true, ExpressionF<{[key in K]: string}>> {
    return $<string, K>(id);
}
export function $n<K extends string>(id: K): Expression<number, true, ExpressionF<{[key in K]: number}>> {
    return $<number, K>(id);
}
export function $b<K extends string>(id: K): Expression<boolean, true, ExpressionF<{[key in K]: boolean}>> {
    return $<boolean, K>(id);
}
export const $d = <K extends string>(id: K) => $<Date, K>(id);

export function $<T extends SQLType, K extends string>(id: K): Expression<T, true, ExpressionF<{[key in K]: T}>> {
    var exec = function(names: {[key: string]: number}, args: SQLType[]) {
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
        precedence: 99
    });
}

export type ToExpression<T extends SQLType | Expression<SQLType, boolean, ExpressionF<never>>> = T extends SQLType ? Expression<T, true, ExpressionF<{}>> : T;
export function rawOrExpression<T extends SQLType | Expression<SQLType, boolean, ExpressionF<never>>>(arg: T): ToExpression<T>;
export function rawOrExpression(arg: SQLType | Expression<SQLType, boolean, ExpressionF<never>>): Expression<SQLType, boolean, ExpressionF<never>> {
    if (typeof arg === 'object' && 'precedence' in arg) {
        return arg;
    } else {
        return r(arg);
    }
}

export function withParentheses(a: string, parentheses: boolean): string {
    if (parentheses) {
        return "(" + a + ")";
    } else {
        return a;
    }
}

export function createTableExpression<T extends TableType>(columns: {[key in keyof T]: T[key] | Expression<T[key], boolean, ExpressionF<never>>}): (alias: string) => TableExpression<T, ExpressionF<{}>> {
    return function ColumnExpressions(alias: string): TableExpression<T, ExpressionF<{}>> {
        var expr: TableExpression<T, ExpressionF<{}>> = <any> {}; //TODO: <any>
        for (let key in columns) {
            expr[key] = expres(() => () => identifier(alias) + "." + identifier(key), 99);
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
