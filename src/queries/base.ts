import { TableTypes, ExpressionF, TableProviders, TableType, TableProvider } from "../query_types";
import { FromQuery, FromClause } from "./select";
import { DeleteStatement } from "./delete";
import { Model } from "../model";

import * as pg from 'pg';

type FromClauseProviders<T> = T extends TableProvider<TableType, ExpressionF<never>> ? T : never;

//TODO: wrong mental model, WITH can only take from generated tables, so Models are a level above "TableProvider"
//TODO: can WITH take from temporary tables?
export class WithQuery<CTE extends TableTypes, P extends ExpressionF<never>> {
    private db: pg.Client;
    private recursiveWith: boolean;
    private cte: TableProviders<CTE, P>;

    constructor(db: pg.Client, cte: TableProviders<CTE, P>, recursive: boolean) {
        this.db = db;
        this.cte = cte;
        this.recursiveWith = recursive;
    }

    from<T extends FromClause<CTE, ExpressionF<never>>>(from: T): FromQuery<CTE, P | FromClauseProviders<T[keyof T]>['parameters'], T> {
        return new FromQuery<CTE, P | FromClauseProviders<T[keyof T]>['parameters'], T>(this.db, {
            recursiveWith: this.recursiveWith,
            cte: this.cte,
            from: from,
            conditions: [],
            groups: {},
            groupConditions: [],
            selected: {},
            orderBy: []
        });
    }

    deleteFrom<D extends TableType>(from: Model<D>): DeleteStatement<CTE, P, D> {
        return new DeleteStatement<CTE, P, D>(this.db, {
            recursiveWith: this.recursiveWith,
            cte: this.cte,
            from: from,
            conditions: [],
            returning: {}
        });
    }
}