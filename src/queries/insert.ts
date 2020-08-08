import { Expression, TableExpression, TableProvider, TableProviders, TableType, TableTypes, ExpressionF, TableSubtype } from '../query_types';
import { identifier, replace, createTableProvider, createTableExpression, expressionWithParentheses } from '../utils';
import { Model } from '../model';
import { BaseSelectStatement } from './select';
import { SQLType } from '../columns';

import * as pg from 'pg';
import { AllTypes, TypeParser } from '../types';
import { getWith, getReturning, FromClause, BaseStatement } from './common';

interface CompleteInsertQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends TableType, R extends TableType> {
    types: TypeParser<Types>;
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    into: Model<I>;
    values: {[key in keyof V]: Expression<V[key], boolean, P>}[] | TableProvider<V, P>;
    returning: {[key in keyof R]: Expression<R[key], boolean, P>};
}

function toQuery
<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends TableType, R extends TableType>
(insertStmt: CompleteInsertQuery<Types, CTE, P, I, V, R>, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>): string {
    function getInto() {
        var values: string[];
        if (insertStmt.values instanceof Array) {
            values = Object.keys(insertStmt.values[0]);
        } else {
            values = Object.keys(insertStmt.values(""));
        }
        return "INSERT INTO " + insertStmt.into()(names, args, types)(parameters) + " AS " + JSON.stringify("__inserting") + " (" + values.map(x => JSON.stringify(x)).join(",") + ")";
    }

    function getValues() {
        if (insertStmt.values instanceof Array) {
            const values: string[] = Object.keys(insertStmt.values[0]);
            const mapper = expressionWithParentheses(-99, names, args, types, parameters);
            return "VALUES " + insertStmt.values.map(x => 
                values.map(k => x[k]).map(mapper).join(",")
            ).map(x => "(" + x + ")").join(",");
        } else {
            return insertStmt.values()(names, args, types)(parameters);
        }
    }

    return [
        getWith(insertStmt, parameters, names, args, types),
        getInto(),
        getValues(),
        getReturning(insertStmt, parameters, names, args, types)
    ].filter(x => x.length > 0).join(" ");
}

class BaseInsertStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends TableType, R extends TableType> extends BaseStatement<Types, P, R> {
    protected db: pg.Client;
    protected query: CompleteInsertQuery<Types, CTE, P, I, V, R>;
    protected into: TableExpression<I, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteInsertQuery<Types, CTE, P, I, V, R>) {
        super(query.returning, (parameters, names, args, types) => toQuery(query, parameters, names, args, types));
        this.db = db;
        this.query = query;
        this.into = query.into("__inserting");
    }
}

export class InsertValuesStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends TableType> extends BaseInsertStatement<Types, CTE, P, I, V, {}> {
    returning<R extends {[key: string]: Expression<SQLType, boolean, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpression<I, ExpressionF<{}>>) => R): BaseInsertStatement<Types, CTE, P | R[keyof R]['execute'], I, V, {[key in keyof R]: R[key]['return_type']}> {
        const returning = lambda(this.into);
        const res: CompleteInsertQuery<Types, CTE, P | R[keyof R]['execute'], I, V, {[key in keyof R]: R[key]['return_type']}> = replace(this.query, "returning", returning);
        return new BaseInsertStatement(this.db, res);
    }
}

type Req<T> = {[key in keyof T]-?: NonNullable<T[key]>};
type OptV<T extends TableType> = {[key in keyof T]?: Expression<T[key], boolean, ExpressionF<TableSubtype>>};
type OptVT<T extends OptV<TableType>> = {[key in keyof Req<T>]: Req<T>[key]['return_type']};
type OptVP<T extends OptV<TableType>> = Req<T>[keyof Req<T>]['execute'];
export class InsertStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType> extends InsertValuesStatement<Types, CTE, P, I, {}> {
    insert<V extends OptV<I>>(...values: Req<V>[]): InsertValuesStatement<Types, CTE, P | OptVP<V>, I, OptVT<V>> {
        const res: CompleteInsertQuery<Types, CTE, P | OptVP<V>, I, OptVT<V>, {}> = replace(this.query, "values", values);
        return new InsertValuesStatement(this.db, res);
    }
    insertFrom<Q extends ExpressionF<TableSubtype>, T extends FromClause<{}, P>, G extends {[key: string]: Expression<SQLType, true, P | Q>}, V extends Req<I>>(lambda: (cte: TableProviders<CTE, ExpressionF<{}>>) => BaseSelectStatement<Types, {}, P | Q, T, G, V>): InsertValuesStatement<Types, CTE, P | Q, I, V> {
        const cteProviders: TableProviders<CTE, ExpressionF<{}>> = <any> {}; //TODO: <any>

        for (let key in this.query.cte) {
            cteProviders[key] = createTableProvider(this.query.cte[key], ()=> () => identifier(key));
        }
        return new InsertValuesStatement(this.db, replace(this.query, "values", lambda(cteProviders)));
    }
}
