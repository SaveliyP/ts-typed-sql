import { TableTypes, ExpressionF, TableProviders, TableType, TableSubtype } from "../query_types";
import { FromQuery } from "./select";
import { DeleteStatement } from "./delete";
import { InsertStatement } from "./insert";
import { UpdateStatement } from "./update";
import { SQLType } from "../columns";
import { Model } from "../model";
import { TypeParser } from "../types";
import { FromClause, FromClauseProviders } from "./common";

import * as pg from 'pg';

//TODO: wrong mental model, WITH can only take from generated tables, so Models are a level above "TableProvider"
//TODO: can WITH take from temporary tables?
export class WithQuery<Types extends {[key in SQLType]: unknown}, CTE extends TableTypes, P extends ExpressionF<TableSubtype>> {
    private db: pg.Client;
    private types: TypeParser<Types>;
    private recursiveWith: boolean;
    private cte: TableProviders<CTE, P>;

    constructor(db: pg.Client, types: TypeParser<Types>, cte: TableProviders<CTE, P>, recursive: boolean) {
        this.db = db;
        this.types = types;
        this.cte = cte;
        this.recursiveWith = recursive;
    }

    from<T extends FromClause<CTE, ExpressionF<TableSubtype>>>(from: T): FromQuery<Types, CTE, P | FromClauseProviders<T[keyof T]>['parameters'], T> {
        return new FromQuery<Types, CTE, P | FromClauseProviders<T[keyof T]>['parameters'], T>(this.db, {
            types: this.types,
            recursiveWith: this.recursiveWith,
            cte: this.cte,
            from: from,
            conditions: [],
            groups: {},
            groupConditions: [],
            returning: {},
            orderBy: []
        });
    }

    deleteFrom<D extends TableType>(from: Model<D>): DeleteStatement<Types, CTE, P, D> {
        return new DeleteStatement<Types, CTE, P, D>(this.db, {
            types: this.types,
            recursiveWith: this.recursiveWith,
            cte: this.cte,
            from: from,
            conditions: [],
            returning: {}
        });
    }

    into<I extends TableType>(into: Model<I>): InsertStatement<Types, CTE, P, I> {
        return new InsertStatement<Types, CTE, P, I>(this.db, {
            types: this.types,
            recursiveWith: this.recursiveWith,
            cte: this.cte,
            into: into,
            values: [],
            returning: {}
        })
    }

    update<U extends TableType>(model: Model<U>): UpdateStatement<Types, CTE, P, U> {
        return new UpdateStatement<Types, CTE, P, U>(this.db, {
            types: this.types,
            recursiveWith: this.recursiveWith,
            cte: this.cte,
            into: model,
            using: {},
            conditions: [],
            set: {},
            returning: {}
        });
    }
}