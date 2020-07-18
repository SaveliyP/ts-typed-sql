import { Expression, SQLType, ExpressionType, TableType, TableProvider } from "./queries";

//https://stackoverflow.com/questions/50374908/transform-union-type-to-intersection-type
export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

export function identifier(id: string): string {
    return "\"" + id.replace(/"/g, "\"\"") + "\"";
}

export function expression<T extends SQLType, U extends boolean, P extends TableType>(expr: ExpressionType[], precedence: number): Expression<T, U, P> {
    return <Expression<T, U, P>> Object.assign(() => expr, {precedence});
}

export function exprToStr(expression: SQLType | Expression<SQLType, boolean, TableType>, outerPrecednece: number): ExpressionType[] {
    var res: ExpressionType[];
    var parentheses = outerPrecednece > 99;

    if (typeof expression === 'function') {
        res = expression();
        parentheses = outerPrecednece > expression.precedence;
    } else if (typeof expression === 'number' || typeof expression === 'string' || typeof expression === 'boolean' || expression instanceof BigInt || expression instanceof Buffer || expression instanceof Date || 'json' in expression) {
        res = [{
            value: expression
        }];
    } else if (expression instanceof Array) {
        res = ["B'" + expression.map(x => (x ? "1" : "0")).join("") + "'"];
    } else {
        throw Error("Bad type! " + typeof expression);
    }

    return parentheses ? ["(",  ...res, ")"] : res;
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

function keys<T extends {}>(obj: T): (keyof T)[] {
    var result: (keyof T)[] = [];
    var k: keyof T;
    for (k in obj) {
        result.push(k);
    }
    return result;
}

export function replace<T extends {}, K extends keyof T, U extends any>(obj: T, key: K, target: U): {[key in keyof T]: key extends K ? (K extends key ? U : T[key]) : T[key]} {
    return  <any> {...omit(obj, key), [key]: target}; //TODO: remove <any>
}

export function repl<T extends {}, U extends {}>(obj: T, target: U): {[key in (keyof T) | (keyof U)]: key extends keyof U ? U[key] : key extends keyof T ? T[key] : never} {
    return <any>{...obj, ...target};
} 