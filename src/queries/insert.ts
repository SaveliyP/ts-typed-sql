import { Expression, TableExpression, TableProvider, TableProviders, TableType, TableTypes, ExpressionF, TableSubtype } from '../query_types';
import { identifier, replace, createTableProvider, expressionWithParentheses } from '../utils';
import { Model } from '../model';
import { BaseSelectStatement } from './select';
import { SQLType } from '../columns';

import * as pg from 'pg';
import { AllTypes, TypeParser } from '../types';
import { getWith, getReturning, FromClause, BaseStatement } from './common';
import { raw } from '../expressions/common';

interface CompleteInsertQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends keyof I, R extends TableType> {
    types: TypeParser<Types>;
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    into: Model<I>;
    values: {[key in V]: Types[I[key]] | null}[] | TableProvider<{[key in V]: I[key]}, P>;
    returning: {[key in keyof R]: Expression<R[key], boolean, P>};
}

function toQuery
<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, K extends keyof I, R extends TableType>
(insertStmt: CompleteInsertQuery<Types, CTE, P, I, K, R>, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>): string {
    function getInto() {
        var values: string[];
        if (insertStmt.values instanceof Array) {
            values = Object.keys(insertStmt.values[0]);
        } else {
            values = Object.keys(insertStmt.values(""));
        }
        values.sort();
        return "INSERT INTO " + insertStmt.into()(names, args, types)(parameters) + " AS " + JSON.stringify("__inserting") + " (" + values.map(x => JSON.stringify(x)).join(",") + ")";
    }

    function getValues() {
        if (insertStmt.values instanceof Array) {
            const te = insertStmt.into("");
            const values: K[] = <K[]> Object.keys(insertStmt.values[0]); //WARN: Type-cast
            values.sort();
            const mapper = expressionWithParentheses(-99, names, args, types, parameters);
            return "VALUES " + insertStmt.values.map(x => 
                values.map(k => raw<Types, I[K]>(x[k], te[k].return_type, types)).map(mapper).join(",")
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

class BaseInsertStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends keyof I, R extends TableType> extends BaseStatement<Types, P, R> {
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

export class InsertValuesStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends keyof I> extends BaseInsertStatement<Types, CTE, P, I, V, {}> {
    returning<R extends {[key: string]: Expression<SQLType, boolean, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpression<I, ExpressionF<{}>>) => R): BaseInsertStatement<Types, CTE, P | R[keyof R]['execute'], I, V, {[key in keyof R]: R[key]['return_type']}> {
        const returning = lambda(this.into);
        const res: CompleteInsertQuery<Types, CTE, P | R[keyof R]['execute'], I, V, {[key in keyof R]: R[key]['return_type']}> = replace(this.query, "returning", returning);
        return new BaseInsertStatement(this.db, res);
    }
}

export class InsertStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType> extends InsertValuesStatement<Types, CTE, P, I, never> {
    insert<K extends keyof I>(values: {[key in K]: Types[I[key]] | null}[]): InsertValuesStatement<Types, CTE, P, I, K> {
        const res: CompleteInsertQuery<Types, CTE, P, I, K, {}> = replace(this.query, "values", values);
        return new InsertValuesStatement(this.db, res);
    }
    insertFrom<K extends keyof I, Q extends ExpressionF<TableSubtype>, G extends {[key: string]: Expression<SQLType, true, P | Q>}>(lambda: (cte: TableProviders<CTE, ExpressionF<{}>>) => BaseSelectStatement<Types, {}, P | Q, G, {[key in K]: I[key]}>): InsertValuesStatement<Types, CTE, P | Q, I, K> {
        const cteProviders: TableProviders<CTE, ExpressionF<{}>> = <any> {}; //WARN: Type-cast

        for (let key in this.query.cte) {
            cteProviders[key] = createTableProvider(this.query.cte[key], () => () => identifier(key));
        }
        return new InsertValuesStatement(this.db, replace(this.query, "values", lambda(cteProviders)));
    }
}
