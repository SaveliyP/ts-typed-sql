import { Expression, TableExpression, TableProvider, TableProviders, TableType, TableTypes, ExpressionF, TableExpressions, TableSubtype } from '../query_types';
import { identifier, replace, withParentheses, expressionWithParentheses } from '../utils';
import { Model } from '../model';
import { SQLType } from '../columns';
import { TypeParser, AllTypes } from '../types';

import * as pg from 'pg';
import { getWhere, getWith, getReturning, getTableExpressions, FromClause, FromClauseType, FromClauseProviders, BaseStatement } from './common';
import { raw } from '../expressions/common';

interface CompleteUpdateQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>, K extends keyof U, R extends TableType> {
    types: TypeParser<Types>;
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    into: Model<U>;
    using: T;
    conditions: Expression<"boolean", boolean, P>[];
    set: {[key in K]: Expression<U[key], boolean, P> | Types[U[key]]};
    returning: {[key in keyof R]: Expression<R[key], boolean, P>};
}

function toQuery
<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>, K extends keyof U, R extends TableType>
(updateStmt: CompleteUpdateQuery<Types, CTE, P, U, T, K, R>, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>): string {
    function getUpdate() {
        return "UPDATE " + updateStmt.into()(names, args, types)(parameters) + " AS " + JSON.stringify("__updating");
    }

    function getUsing() {
        const fromClause: string[] = [];
        for (const x in updateStmt.using) {
            const fn = updateStmt.using[x];
            if (typeof fn === 'string') {
                fromClause.push(identifier(fn) + " AS " + identifier(x));
            } else if (typeof fn === 'number') {
                throw Error("Cannot use numbers in FROM clause");
            } else if (typeof fn === 'symbol') {
                throw Error("Cannot use symbols in FROM clause");
            } else if (typeof fn === 'function') {
                const a: TableProvider<TableType, P> = fn as TableProvider<TableType, P>;
                var parentheses = a instanceof BaseStatement;
                fromClause.push(withParentheses(a()(names, args, types)(parameters), parentheses) + " AS " + identifier(x));
            } else {
                throw Error("Unknown type");
            }
        }
        return fromClause.length > 0 ? ("FROM " + fromClause.join(",")) : "";
    }

    function getValues() {
        const te = updateStmt.into("");
        const mapper = expressionWithParentheses(4, names, args, types, parameters);
        return "SET " + Object.keys(updateStmt.set).map(key => {
            const k = <K> key; //WARN: Type-cast
            const val = updateStmt.set[k];
            return identifier(key) + "=" + mapper(val instanceof Expression ? val : raw<Types, U[K]>(val, te[k].return_type, types));
        }).join(",");
    }

    return [
        getWith(updateStmt, parameters, names, args, types),
        getUpdate(),
        getValues(),
        getUsing(),
        getWhere(updateStmt, parameters, names, args, types),
        getReturning(updateStmt, parameters, names, args, types)
    ].filter(x => x.length > 0).join(" ");
}

class BaseUpdateStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>, K extends keyof U, R extends TableType> extends BaseStatement<Types, P, R> {
    protected db: pg.Client;
    protected query: CompleteUpdateQuery<Types, CTE, P, U, T, K, R>;
    protected into: TableExpression<U, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteUpdateQuery<Types, CTE, P, U, T, K, R>) {
        super(query.returning, (parameters, names, args, types) => toQuery(query, parameters, names, args, types));
        this.db = db;
        this.query = query;
        this.into = query.into("__updating");
    }
}

export class UpdateSetStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>, K extends keyof U> extends BaseUpdateStatement<Types, CTE, P, U, T, K, {}> {
    returning<R extends {[key: string]: Expression<SQLType, boolean, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpression<U, ExpressionF<{}>>) => R): BaseUpdateStatement<Types, CTE, P | R[keyof R]['execute'], U, T, K, {[key in keyof R]: R[key]['return_type']}> {
        const returning = lambda(this.into);
        const res: CompleteUpdateQuery<Types, CTE, P | R[keyof R]['execute'], U, T, K, {[key in keyof R]: R[key]['return_type']}> = replace(this.query, "returning", returning);
        return new BaseUpdateStatement(this.db, res);
    }
}

type OptV<Types extends AllTypes, U extends TableType, K extends keyof U, Q extends TableType> = {[key in K]: Expression<U[key], boolean, ExpressionF<Q>> | Types[U[key]] | null};

export class UpdateFromStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>> {
    protected db: pg.Client;
    protected query: CompleteUpdateQuery<Types, CTE, P, U, T, never, {}>;
    protected into: TableExpression<U, ExpressionF<{}>>;
    protected usingT: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteUpdateQuery<Types, CTE, P, U, T, never, {}>) {
        this.db = db;
        this.query = query;
        this.into = query.into("__updating");
        this.usingT = getTableExpressions(query.cte, query.using);
    }
    set<K extends keyof U, Q extends TableType = {}>(lambda: (t: TableExpression<U, ExpressionF<{}>>, u: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>) => OptV<Types, U, K, Q>): UpdateSetStatement<Types, CTE, P | ExpressionF<Q>, U, T, K> {
        const set = lambda(this.into, this.usingT);
        return new UpdateSetStatement<Types, CTE, P | ExpressionF<Q>, U, T, K>(this.db, replace(this.query, "set", set));
    }

    where<Q extends ExpressionF<TableSubtype>>(lambda: (t: TableExpression<U, ExpressionF<{}>>, u: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>) => Expression<"boolean", boolean, P | Q>): UpdateFromStatement<Types, CTE, P | Q, U, T> {
        return new UpdateFromStatement(this.db, replace(this.query, "conditions", [...this.query.conditions, lambda(this.into, this.usingT)]));
    }
}

export class UpdateStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType> extends UpdateFromStatement<Types, CTE, P, U, {}> {
    using<T extends FromClause<CTE, ExpressionF<TableSubtype>>>(using: T): UpdateFromStatement<Types, CTE, P | FromClauseProviders<T[keyof T]>['parameters'], U, T> {
        return new UpdateFromStatement<Types, CTE, P | FromClauseProviders<T[keyof T]>['parameters'], U, T>(this.db, replace(this.query, "using", using));
    }
}
