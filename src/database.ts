import * as pg from 'pg';
import base from './queries/index';
import { SQLType } from './columns';
import { AllTypes, TypeParser } from './types';
import { Expression, ExpressionF } from './query_types';
import { TypeMapping } from './utils';
import { expressions } from './expressions/expressions';
import { op } from './expressions/operators';

export async function database<Types extends AllTypes>(options: string | pg.ClientConfig, types: TypeParser<Types>) {
    const db = new pg.Client(options);
    const b = base(db, types);
    
    function raw<T extends SQLType>(value: Types[T] | null, type: T): Expression<T, true, ExpressionF<{}>> {
        const exec = function(names: {[key: string]: number}, args: unknown[]) {
            args.push(value);
            const id = args.length;
            return function(parameters: {}) {
                return "CAST ($" + id + " AS " + TypeMapping[type] + ")";
            }
        };

        return new Expression(exec, type, true, 99);
    }

    const literals: {[key in SQLType]: (value: Types[key] | null) => Expression<key, true, ExpressionF<{}>>} = {
        smallint: value => raw(value, "smallint"),
        integer: value => raw(value, "integer"),
        bigint: value => raw(value, "bigint"),
        float: value => raw(value, "float"),
        double: value => raw(value, "double"),
        numeric: value => raw(value, "numeric"),
    
        boolean: value => raw(value, "boolean"),
        bit: value => raw(value, "bit"),
        binary: value => raw(value, "binary"),
    
        text: value => raw(value, "text"),
        enum: value => raw(value, "enum"),
    
        json: value => raw(value, "json"),
    
        time: value => raw(value, "time"),
        date: value => raw(value, "date"),
        timestamp: value => raw(value, "timestamp"),
    };

    await db.connect();

    return {
        with: b.withT,
        withRecursive: b.withRecursive,

        from: b.from,
        select: b.select,

        deleteFrom: b.deleteFrom,

        into: b.into,

        update: b.update,
        raw: (sql: string, params?: unknown[]) => db.query(sql, params),

        close: () => db.end(),

        literal: literals,
        expression: expressions(types),
        operator: op(types),
    };
}