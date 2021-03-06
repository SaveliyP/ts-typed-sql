import { Expression, TableExpression, TableProviders, TableType, TableTypes, ExpressionF, TableSubtype } from '../query_types';
import { replace } from '../utils';
import { Model } from '../model';
import { SQLType } from '../columns';
import { AllTypes, TypeParser } from '../types';
import { getWith, getReturning, getWhere, BaseStatement } from './common';

import * as pg from 'pg';

interface CompleteDeleteQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, D extends TableType, R extends TableType> {
    types: TypeParser<Types>,
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    from: Model<D>;
    conditions: Expression<"boolean", boolean, P>[];
    returning: {[key in keyof R]: Expression<R[key], boolean, P>};
}

function toQuery
<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, D extends TableType, R extends TableType>
(deleteStmt: CompleteDeleteQuery<Types, CTE, P, D, R>, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>): string {
    function getFrom() {
        return "DELETE FROM " + deleteStmt.from()(names, args, types)(parameters) + " AS " + JSON.stringify("__deleting");
    }

    return [
        getWith(deleteStmt, parameters, names, args, types),
        getFrom(),
        getWhere(deleteStmt, parameters, names, args, types),
        getReturning(deleteStmt, parameters, names, args, types)
    ].filter(x => x.length > 0).join(" ");
}

class BaseDeleteStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, D extends TableType, R extends TableType> extends BaseStatement<Types, P, R> {
    protected db: pg.Client;
    protected query: CompleteDeleteQuery<Types, CTE, P, D, R>;
    protected from: TableExpression<D, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteDeleteQuery<Types, CTE, P, D, R>) {
        super(query.returning, (parameters, names, args, types) => toQuery(query, parameters, names, args, types));
        this.db = db;
        this.query = query;
        this.from = query.from("__deleting");
    }
}

export class DeleteStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, D extends TableType> extends BaseDeleteStatement<Types, CTE, P, D, {}> {
    returning<R extends {[key: string]: Expression<SQLType, boolean, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpression<D, ExpressionF<{}>>) => R): BaseDeleteStatement<Types, CTE, P | R[keyof R]['execute'], D, {[key in keyof R]: R[key]['return_type']}> {
        const returning = lambda(this.from);
        const res: CompleteDeleteQuery<Types, CTE, P | R[keyof R]['execute'], D, {[key in keyof R]: R[key]['return_type']}> = replace(this.query, "returning", returning);
        return new BaseDeleteStatement(this.db, res);
    }

    where<Q extends ExpressionF<TableSubtype>>(lambda: (t: TableExpression<D, ExpressionF<{}>>) => Expression<"boolean", boolean, P | Q>): DeleteStatement<Types, CTE, P | Q, D> {
        return new DeleteStatement(this.db, replace(this.query, "conditions", [...this.query.conditions, lambda(this.from)]));
    }
}
