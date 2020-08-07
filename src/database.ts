import * as pg from 'pg';
import base from './queries/index';
import { SQLType } from './columns';
import { TypeParser } from './types';

export async function database<T extends {[key in SQLType]: unknown}>(options: string | pg.ClientConfig, types: TypeParser<T>) {
    const db = new pg.Client(options);
    const b = base(db, types);

    await db.connect();

    return {
        with: b.withT,
        withRecursive: b.withRecursive,

        from: b.from,
        select: b.select,

        deleteFrom: b.deleteFrom,

        into: b.into,

        update: b.update,
        raw: (sql: string, params?: any[]) => db.query(sql, params),
    };
}