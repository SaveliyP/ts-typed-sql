import { Expression, TableExpressions, TableProvider, TableProviders, TableType, TableTypes, ExpressionF, TableSubtype } from '../query_types';
import { identifier, replace, withParentheses, expressionWithParentheses } from '../utils';
import { SQLType } from '../columns';
import { AllTypes, TypeParser } from '../types';
import { getWith, getWhere, FromClauseType, FromClause, getTableExpressions, BaseStatement } from './common';

import * as pg from 'pg';

type GroupClause<P extends ExpressionF<TableSubtype>> = {[key: string]: Expression<SQLType, true, P>};

interface CompleteSelectQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends FromClause<CTE, P>, G extends GroupClause<P>, S extends TableType> {
    types: TypeParser<Types>;
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    from: T;
    conditions: Expression<"boolean", boolean, P>[];
    groups: G;
    groupConditions: Expression<"boolean", true, P>[];
    returning: {[key in keyof S]: Expression<S[key], {} extends G ? boolean : true, P>};
    orderBy: Expression<SQLType, true, P>[];
    limit?: number;
    offset?: number;
}

function toQuery
<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType>
(select: CompleteSelectQuery<Types, CTE, P, T, G, S>, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>): string {
    const mapper0 = expressionWithParentheses(0, names, args, types, parameters);
    const mapper2 = expressionWithParentheses(2, names, args, types, parameters);

    function getFrom() {
        const fromClause: string[] = [];
        for (const x in select.from) {
            const fn = select.from[x];
            if (typeof fn === 'string') {
                fromClause.push(identifier(fn) + " AS " + identifier(x));
            } else if (typeof fn === 'number') {
                throw Error("Cannot use numbers in FROM clause");
            } else if (typeof fn === 'symbol') {
                throw Error("Cannot use symbols in FROM clause");
            } else if (typeof fn === 'function') {
                const a: TableProvider<TableType, P> = fn as TableProvider<TableType, P>;
                var parentheses = a instanceof BaseSelectStatement;
                fromClause.push(withParentheses(a()(names, args, types)(parameters), parentheses) + " AS " + identifier(x));
            } else {
                throw Error("Unknown type");
            }
        }
        return fromClause.length > 0 ? ("FROM " + fromClause.join(",")) : "";
    }

    function getGroupBy() {
        const groups = Object.values(select.groups);
        return groups.length > 0 ? "GROUP BY " + groups.map(mapper0).join(",") : "";
    }

    function getHaving() {
        return select.groupConditions.length > 0 ? "HAVING " + select.groupConditions.map(mapper2).join(" AND ") : "";
    }

    function getSelect() {
        const selects: string[] = [];
        for (const key in select.returning) {
            selects.push(mapper0(select.returning[key]) + " AS " + identifier(key));
        }
        if (selects.length == 0) {
            throw Error("Must select at least one value!");
        }
        return "SELECT " + selects.join(",");
    }

    function getOrderBy() {
        const orderedBy: string[] = select.orderBy.map(mapper0);
        return orderedBy.length > 0 ? "ORDER BY " + orderedBy.join(","): "";
    }

    function getLimit() {
        return select.limit != null ? "LIMIT " + select.limit : "";
    }

    function getOffset() {
        return select.offset != null ? "OFFSET " + select.offset : "";
    }

    return [
        getWith(select, parameters, names, args, types),
        getSelect(),
        getFrom(),
        getWhere(select, parameters, names, args, types),
        getGroupBy(),
        getHaving(),
        getOrderBy(),
        getLimit(),
        getOffset()
    ].filter(x => x.length > 0).join(" ");
}

type ConvertGroupedQuery<Q extends ExpressionF<TableSubtype>, G extends {[key: string]: Expression<SQLType, boolean, Q>}> = {[key in keyof G]: Expression<G[key]['return_type'], true, G[key]['execute']>};
export class FromQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends FromClause<CTE, P>> {
    private db: pg.Client;
    private query: CompleteSelectQuery<Types, CTE, P, T, {}, {}>;
    private from: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>

    constructor(db: pg.Client, query: CompleteSelectQuery<Types, CTE, P, T, {}, {}>) {
        this.db = db;
        this.query = query;
        this.from = getTableExpressions(query.cte, query.from);
    }

    where<Q extends ExpressionF<TableSubtype>>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>) => Expression<"boolean", boolean, P | Q>): FromQuery<Types, CTE, P | Q, T> {
        return new FromQuery(this.db, replace(this.query, "conditions", [...this.query.conditions, lambda(this.from)]));
    }

    groupBy<G extends {[key: string]: Expression<SQLType, boolean, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>) => G): GroupedQuery<Types, CTE, P | G[keyof G]['execute'], T, ConvertGroupedQuery<P | G[keyof G]['execute'], G>> {
        const groups: ConvertGroupedQuery<P | G[keyof G]['execute'], G> = <any> lambda(this.from);
        return new GroupedQuery<Types, CTE, P | G[keyof G]['execute'], T, ConvertGroupedQuery<P | G[keyof G]['execute'], G>>(this.db, replace(this.query, "groups", groups), this.from);
    }

    select<S extends {[key: string]: Expression<SQLType, boolean, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>) => S): SelectStatement<Types, CTE, P | S[keyof S]['execute'], T, {}, {[key in keyof S]: S[key]['return_type']}> {
        const select = lambda(this.from);
        const res: CompleteSelectQuery<Types, CTE, P | S[keyof S]['execute'], T, {}, {[key in keyof S]: S[key]['return_type']}> = replace(this.query, "returning", select);
        return new SelectStatement(this.db, res);
    }
}

class GroupedQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends FromClause<CTE, P>, G extends GroupClause<P>> {
    private db: pg.Client;
    private query: CompleteSelectQuery<Types, CTE, P, T, G, {}>;
    private from: TableExpressions<FromClauseType<CTE, T>, P>;

    constructor(db: pg.Client, query: CompleteSelectQuery<Types, CTE, P, T, G, {}>, from: TableExpressions<FromClauseType<CTE, T>, P>) {
        this.db = db;
        this.query = query;
        this.from = from;
    }

    having<Q extends ExpressionF<TableSubtype>>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>, g: G) => Expression<"boolean", true, P | Q>): GroupedQuery<Types, CTE, P | Q, T, G> {
        return new GroupedQuery(this.db, replace(this.query, "groupConditions", [...this.query.groupConditions, lambda(this.from, this.query.groups)]), this.from);
    }

    select<S extends {[key: string]: Expression<SQLType, {} extends G ? boolean : true, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>, groups: G) => S): SelectStatement<Types, CTE, P | S[keyof S]['execute'], T, G, {[key in keyof S]: S[key]['return_type']}> {
        const select = lambda(this.from, this.query.groups);
        const res: CompleteSelectQuery<Types, CTE, P | S[keyof S]['execute'], T, G, {[key in keyof S]: S[key]['return_type']}> = replace(this.query, "returning", select);
        return new SelectStatement(this.db, res);
    }
}

export class BaseSelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends BaseStatement<Types, P, S> {
    protected db: pg.Client;
    protected query: CompleteSelectQuery<Types, CTE, P, T, G, S>;

    constructor(db: pg.Client, query: CompleteSelectQuery<Types, CTE, P, T, G, S>) {
        super(query.returning, (parameters, names, args, types) => toQuery(query, parameters, names, args, types));
        this.db = db;
        this.query = query;
    }
}

class LimitedSelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends BaseSelectStatement<Types, CTE, P, T, G, S> {
    offset(offset: number): BaseSelectStatement<Types, CTE, P, T, G, S> {
        this.query.offset = offset;
        return this;
    }
}

class OrderedSelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends LimitedSelectStatement<Types, CTE, P, T, G, S> {
    limit(limit: number): LimitedSelectStatement<Types, CTE, P, T, G, S> {
        this.query.limit = limit;
        return this;
    }
}

export class SelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends OrderedSelectStatement<Types, CTE, P, T, G, S> {
    orderBy(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>, g: G) => [Expression<SQLType, {} extends G ? boolean : true, P>]): OrderedSelectStatement<Types, CTE, P, T, G, S> {
        //this.query.orderBy.push(lambda(this., this.query.groups)); //TODO: finish order by
        return this;
    }
}
