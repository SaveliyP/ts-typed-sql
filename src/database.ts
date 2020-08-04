import * as pg from 'pg';
import base from './queries/index';
import { SQLType } from './columns';

//TODO: register all possible types
pg.types.setTypeParser(1700, str => {
    return Number.parseFloat(str);
});

export async function database(options: string | pg.ClientConfig) {
    const db = new pg.Client(options);
    const b = base(db);

    //await db.connect();

    return {
        with: b.withT,
        withRecursive: b.withRecursive,

        from: b.from,
        select: b.select,

        deleteFrom: b.deleteFrom,

        into: b.into,

        update: b.update,
    };
}