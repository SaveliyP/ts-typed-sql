import { TableTypes, ExpressionF, TableProviders, TableType, TableSubtype, TableExpressions, Expression } from "../query_types";
import { FromQuery, BaseSelectStatement, AllSelectStatements, CombinableStatement } from "./select";
import { DeleteStatement } from "./delete";
import { InsertStatement } from "./insert";
import { UpdateStatement } from "./update";
import { SQLType } from "../columns";
import { Model } from "../model";
import { AllTypes, TypeParser } from "../types";
import { FromClause, FromClauseProviders, FromClauseType, getExpressionsFromProviders, getFromCTE, getFromTableProviders } from "./common";

import * as pg from 'pg';

export class WithQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>> {
    protected db: pg.Client;
    protected types: TypeParser<Types>;
    protected recursiveWith: boolean;
    protected cte: TableProviders<CTE, P>;

    constructor(db: pg.Client, types: TypeParser<Types>, cte: TableProviders<CTE, P>, recursive: boolean) {
        this.db = db;
        this.types = types;
        this.cte = cte;
        this.recursiveWith = recursive;
    }

    from<T extends FromClause<CTE, ExpressionF<TableSubtype>>>(from: T): FromQuery<Types, CTE, P | FromClauseProviders<T[keyof T]>['parameters'], FromClauseType<CTE, T>> {
        return new FromQuery<Types, CTE, P | FromClauseProviders<T[keyof T]>['parameters'], FromClauseType<CTE, T>>(this.db, {
            types: this.types,
            recursiveWith: this.recursiveWith,
            cte: this.cte,
            from: getFromTableProviders<CTE, P | FromClauseProviders<T[keyof T]>['parameters'], T>(this.cte, from),
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

export class WithRQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>> {
    protected db: pg.Client;
    protected types: TypeParser<Types>;
    protected cte: {[key in keyof CTE]: CombinableStatement<Types, {}, P, CTE[key]>};

    constructor(db: pg.Client, types: TypeParser<Types>, cte: {[key in keyof CTE]: CombinableStatement<Types, {}, P, CTE[key]>}) {
        this.db = db;
        this.types = types;
        this.cte = cte;
    }

    recursive<Q extends ExpressionF<TableSubtype>, K extends keyof CTE>(lambda: (t: TableProviders<CTE, ExpressionF<{}>>) => {[key in K]: AllSelectStatements<Types, {}, P | Q, CTE[key]>}): WithQuery<Types, CTE, P | Q> {
        const l = lambda(getFromCTE(this.cte));
        const newCTE: {[key in keyof CTE]: CombinableStatement<Types, {}, P | Q, CTE[key]>} = <any> {}; //WARN: Type-cast

        let key1: keyof CTE;
        for (key1 in this.cte) {
            newCTE[key1] = this.cte[key1];
        }

        let key: K;
        for (key in l) {
            newCTE[key] = newCTE[key].union<P | Q>(() => l[key]);
        }

        return new WithQuery(this.db, this.types, newCTE, true);
    }

    recursiveAll<Q extends ExpressionF<TableSubtype>, K extends keyof CTE>(lambda: (t: TableProviders<CTE, ExpressionF<{}>>) => {[key in K]: AllSelectStatements<Types, {}, P | Q, CTE[key]>}): WithQuery<Types, CTE, P | Q> {
        const l = lambda(getFromCTE(this.cte));
        const newCTE: {[key in keyof CTE]: CombinableStatement<Types, {}, P | Q, CTE[key]>} = <any> {}; //WARN: Type-cast

        let key1: keyof CTE;
        for (key1 in this.cte) {
            newCTE[key1] = this.cte[key1];
        }

        let key: K;
        for (key in l) {
            newCTE[key] = newCTE[key].unionAll<P | Q>(() => l[key]);
        }

        return new WithQuery(this.db, this.types, newCTE, true);
    }
}