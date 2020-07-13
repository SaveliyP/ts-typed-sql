import * as pg from 'pg';
import select from './select';

export async function database(options: string | pg.ClientConfig) {
    const db = new pg.Client(options);
    const s = select(db);

    await db.connect();

    return {
        with: s.withT,
        withRecursive: s.withRecursive,
        from: s.from,
        select: s.select
    };
}