import { Expression } from "./queries";

export function identifier(id: string): string {
    return "\"" + id.replace(/"/g, "\"\"") + "\"";
}

export function expression<T, U extends boolean>(expr: string, precedence: number): Expression<T, U> {
    return <Expression<T, U>> Object.assign(() => expr, {precedence});
}

export function exprToStr<T>(expression: Expression<T, any> | T, outerPrecednece: number) {
    var res: string;
    var parentheses = outerPrecednece > 99;

    if (expression instanceof Function) {
        res = expression();
        parentheses = outerPrecednece > expression.precedence;
    } else if (typeof expression === 'number') {
        res = expression.toString();
    } else if (typeof expression === 'boolean') {
        res = expression ? "true" : "false";
    } else if (typeof expression === 'string') {
        res = "CAST (X'" + Buffer.from(expression, "utf8").toString("hex") + "' AS TEXT)"; //TODO: probably invalid syntax
    } else if (expression instanceof Buffer) {
        res = "X'" + expression.toString("hex") + "'";
    } else if (expression instanceof Array) {
        res = "B'" + expression.map(x => (x ? "1" : "0")).join("") + "'";
    } else {
        throw new Error("Bad type! " + typeof expression);
    }

    return parentheses ? "(" + res + ")" : res;
}

//https://stackoverflow.com/questions/53966509/typescript-type-safe-omit-function
function omit<T extends object, K extends [...(keyof T)[]]>(obj: T, ...keys: K): {
    [K2 in Exclude<keyof T, K[number]>]: T[K2]
} {
    let ret = {} as {
        [K in keyof typeof obj]: (typeof obj)[K]
    };
    let key: keyof typeof obj;
    for (key in obj) {
        if (!(keys.includes(key))) {
            ret[key] = obj[key];
        }
    }
    return ret;
}

function property<K extends keyof {}, U extends any>(key: K, obj: U): {[key in K]: U} {
    return {[key]: obj};
}

export function replace<T extends {}, K extends keyof T, U extends any>(obj: T, key: K, target: U): {[key in keyof T]: key extends K ? (K extends key ? U : T[key]) : T[key]} {
    return  <any>{...omit(obj, key), [key]: target}; //TODO: remove <any>
}