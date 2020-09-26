import { Expression, TableExpressions, TableProvider, TableProviders, TableType, TableTypes, ExpressionF, TableSubtype, TableExpression } from '../query_types';
import { identifier, replace, withParentheses, expressionWithParentheses } from '../utils';
import { SQLType } from '../columns';
import { AllTypes, TypeParser } from '../types';
import { getWith, getWhere, FromClauseType, FromClause, getTableExpressions, BaseStatement, getExpressionsFromProviders } from './common';

import * as pg from 'pg';

type AGroupClause<P extends ExpressionF<TableSubtype>> = {[key: string]: Expression<SQLType, boolean, P>};
type GroupClause<P extends ExpressionF<TableSubtype>> = {[key: string]: Expression<SQLType, true, P>};

const QuerySymbol = Symbol("Select query data");

export interface CompleteSelectQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends TableTypes, G extends GroupClause<P>, S extends TableType> {
    types: TypeParser<Types>;
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    from: TableProviders<T, P>;
    conditions: Expression<"boolean", boolean, P>[];
    groups: G;
    groupConditions: Expression<"boolean", true, P>[];
    returning: {[key in keyof S]: Expression<S[key], {} extends G ? boolean : true, P>};
    orderBy: Expression<SQLType, {} extends G ? boolean : true, P>[];
    limit?: number;
    offset?: number;
}

export interface CombinedSelectQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, S extends TableType> {
    types: TypeParser<Types>;
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    op: "UNION" | "INTERSECT" | "EXCEPT";
    all: boolean;
    expressions: (CombinedSelectQuery<Types, {}, P, S> | CompleteSelectQuery<Types, {}, P, TableTypes, {[key: string]: Expression<SQLType, true, P>}, S>)[];
    returning: {[key in keyof S]: Expression<S[key], boolean, P>};
    orderBy: Expression<SQLType, boolean, P>[];
    limit?: number;
    offset?: number;
}

function toQuery
<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends TableTypes, G extends GroupClause<P>, S extends TableType>
(select: CompleteSelectQuery<Types, CTE, P, T, G, S>, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>): string {
    const mapper0 = expressionWithParentheses(0, names, args, types, parameters);
    const mapper2 = expressionWithParentheses(2, names, args, types, parameters);

    function getFrom() {
        const fromClause: string[] = [];
        for (const x in select.from) {
            const fn = select.from[x];
            var parentheses = fn instanceof BaseStatement;
            fromClause.push(withParentheses(fn()(names, args, types)(parameters), parentheses) + " AS " + identifier(x));
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
        const keys: ((keyof S) & string)[] = [];
        for (const key in select.returning) {
            keys.push(key);
        }
        keys.sort();
        const selects = keys.map(key => mapper0(select.returning[key]) + " AS " + identifier(key));
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
        "(",
        getSelect(),
        getFrom(),
        getWhere(select, parameters, names, args, types),
        getGroupBy(),
        getHaving(),
        getOrderBy(),
        getLimit(),
        getOffset(),
        ")"
    ].filter(x => x.length > 0).join(" ");
}

function toCombinedQuery
<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, S extends TableType>
(select: CombinedSelectQuery<Types, CTE, P, S>, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>): string {
    const mapper0 = expressionWithParentheses(0, names, args, types, parameters);
    const mapper2 = expressionWithParentheses(2, names, args, types, parameters);

    function getQueries() {
        return select.expressions.map(x => {
            if ('op' in x) {
                return toCombinedQuery(x, parameters, names, args, types);
            } else {
                return toQuery(x, parameters, names, args, types);
            }
        }).join(" " + select.op + (select.all ? " ALL " : " "));
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
        "(",
        getQueries(),
        getOrderBy(),
        getLimit(),
        getOffset(),
        ")"
    ].filter(x => x.length > 0).join(" ");
}

type ConvertGroupedQuery<Q extends ExpressionF<TableSubtype>, G extends AGroupClause<Q>> = {[key in keyof G]: Expression<G[key]['return_type'], true, G[key]['execute']>};
export class FromQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends TableTypes> {
    private db: pg.Client;
    private query: CompleteSelectQuery<Types, CTE, P, T, {}, {}>;
    private from: TableExpressions<T, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteSelectQuery<Types, CTE, P, T, {}, {}>) {
        this.db = db;
        this.query = query;
        this.from = getExpressionsFromProviders(query.from);
    }

    where<Q extends ExpressionF<TableSubtype>>(lambda: (t: TableExpressions<T, ExpressionF<{}>>) => Expression<"boolean", boolean, P | Q>): FromQuery<Types, CTE, P | Q, T> {
        return new FromQuery(this.db, replace(this.query, "conditions", [...this.query.conditions, lambda(this.from)]));
    }

    groupBy<G extends AGroupClause<ExpressionF<TableSubtype>>>(lambda: (t: TableExpressions<T, ExpressionF<{}>>) => G): GroupedQuery<Types, CTE, P | G[keyof G]['execute'], T, ConvertGroupedQuery<P | G[keyof G]['execute'], G>> {
        const groups: ConvertGroupedQuery<P | G[keyof G]['execute'], G> = <any> lambda(this.from); //WARN: Type-cast
        return new GroupedQuery<Types, CTE, P | G[keyof G]['execute'], T, ConvertGroupedQuery<P | G[keyof G]['execute'], G>>(this.db, replace(replace(this.query, "groups", groups), "orderBy", []), this.from);
    }

    select<S extends {[key: string]: Expression<SQLType, boolean, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpressions<T, ExpressionF<{}>>) => S): SelectStatement<Types, CTE, P | S[keyof S]['execute'], T, {}, {[key in keyof S]: S[key]['return_type']}> {
        const select = lambda(this.from);
        const res: CompleteSelectQuery<Types, CTE, P | S[keyof S]['execute'], T, {}, {[key in keyof S]: S[key]['return_type']}> = replace(this.query, "returning", select);
        return new SelectStatement(this.db, res, this.from, getExpressionsFromProviders(this.query.cte));
    }
}

class GroupedQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends TableTypes, G extends GroupClause<P>> {
    private db: pg.Client;
    private query: CompleteSelectQuery<Types, CTE, P, T, G, {}>;
    private from: TableExpressions<T, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteSelectQuery<Types, CTE, P, T, G, {}>, from: TableExpressions<T, ExpressionF<{}>>) {
        this.db = db;
        this.query = query;
        this.from = from;
    }

    having<Q extends ExpressionF<TableSubtype>>(lambda: (t: TableExpressions<T, ExpressionF<{}>>, g: G) => Expression<"boolean", true, P | Q>): GroupedQuery<Types, CTE, P | Q, T, G> {
        return new GroupedQuery(this.db, replace(this.query, "groupConditions", [...this.query.groupConditions, lambda(this.from, this.query.groups)]), this.from);
    }

    select<S extends {[key: string]: Expression<SQLType, {} extends G ? boolean : true, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpressions<T, ExpressionF<{}>>, groups: G) => S): SelectStatement<Types, CTE, P | S[keyof S]['execute'], T, G, {[key in keyof S]: S[key]['return_type']}> {
        const select = lambda(this.from, this.query.groups);
        const res: CompleteSelectQuery<Types, CTE, P | S[keyof S]['execute'], T, G, {[key in keyof S]: S[key]['return_type']}> = replace(this.query, "returning", select);
        return new SelectStatement(this.db, res, this.from, getExpressionsFromProviders(this.query.cte));
    }
}

function CombineStatements
<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, S extends TableType>
(
    query: CompleteSelectQuery<Types, CTE, P, TableTypes, GroupClause<P>, S> | CombinedSelectQuery<Types, CTE, P, S>,
    op: "UNION" | "INTERSECT" | "EXCEPT",
    all: boolean,
    db: pg.Client,
    cte: TableExpressions<CTE, ExpressionF<{}>>,
    lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P, S>
) {
    const changedQuery: CompleteSelectQuery<Types, {}, P, TableTypes, GroupClause<P>, S> | CombinedSelectQuery<Types, {}, P, S> = replace(query, "cte", {});
    const newQuery: CombinedSelectQuery<Types, CTE, P, S> = {
        types: query.types,
        recursiveWith: query.recursiveWith,
        cte: query.cte,
        op: op,
        all: all,
        expressions: [changedQuery, lambda(cte)[QuerySymbol]],
        returning: changedQuery.returning,
        orderBy: []
    };
    
    return new CombinedSelectStatement(db, newQuery, cte);
}

export type AllSelectStatements<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, S extends TableType> = BaseSelectStatement<Types, CTE, P, GroupClause<P>, S> | BaseCombinedSelectStatement<Types, CTE, P, S>;
export interface CombinableStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, S extends TableType> extends TableProvider<S, P> {
    union<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>): CombinedSelectStatement<Types, CTE, P | Q, S>;
    unionAll<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>): CombinedSelectStatement<Types, CTE, P | Q, S>;
    intersect<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>): CombinedSelectStatement<Types, CTE, P | Q, S>;
    intersectAll<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>): CombinedSelectStatement<Types, CTE, P | Q, S>;
    except<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>): CombinedSelectStatement<Types, CTE, P | Q, S>;
    exceptAll<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>): CombinedSelectStatement<Types, CTE, P | Q, S>;
};

export class BaseCombinedSelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, S extends TableType> extends BaseStatement<Types, P, S> implements CombinableStatement<Types, CTE, P, S> {
    protected db: pg.Client;
    protected query: CombinedSelectQuery<Types, CTE, P, S>;
    protected cte: TableExpressions<CTE, ExpressionF<{}>>;
    get [QuerySymbol]() {
        return this.query;
    }

    constructor(db: pg.Client, query: CombinedSelectQuery<Types, CTE, P, S>, cte: TableExpressions<CTE, ExpressionF<{}>>) {
        super(query.returning, (parameters, names, args, types) => toCombinedQuery(query, parameters, names, args, types));
        this.db = db;
        this.query = query;
        this.cte = cte;
    }

    union<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "UNION", false, this.db, this.cte, lambda);
    }

    unionAll<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "UNION", true, this.db, this.cte, lambda);
    }

    intersect<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "INTERSECT", false, this.db, this.cte, lambda);
    }

    intersectAll<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "INTERSECT", true, this.db, this.cte, lambda);
    }

    except<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "EXCEPT", false, this.db, this.cte, lambda);
    }

    exceptAll<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "EXCEPT", true, this.db, this.cte, lambda);
    }
}

class LimitedCombinedSelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, S extends TableType> extends BaseCombinedSelectStatement<Types, CTE, P, S> {
    offset(offset: number): BaseCombinedSelectStatement<Types, CTE, P, S> {
        this.query.offset = offset;
        return this;
    }
}

class OrderedCombinedSelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, S extends TableType> extends LimitedCombinedSelectStatement<Types, CTE, P, S> {
    limit(limit: number): LimitedCombinedSelectStatement<Types, CTE, P, S> {
        this.query.limit = limit;
        return this;
    }
}

export class CombinedSelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, S extends TableType> extends OrderedCombinedSelectStatement<Types, CTE, P, S> {
    orderBy<Q extends ExpressionF<TableSubtype>>(lambda: (t: {[key in keyof S]: Expression<S[key], boolean, P>}) => Expression<SQLType, boolean, Q>[]): OrderedCombinedSelectStatement<Types, CTE, P | Q, S> {
        return new OrderedCombinedSelectStatement<Types, CTE, P | Q, S>(this.db, replace(this.query, "orderBy", lambda(this.query.returning)), this.cte);
    }
}

export class BaseSelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends BaseStatement<Types, P, S> implements CombinableStatement<Types, CTE, P, S> {
    protected db: pg.Client;
    protected query: CompleteSelectQuery<Types, CTE, P, TableTypes, G, S>;
    protected cte: TableExpressions<CTE, ExpressionF<{}>>;
    get [QuerySymbol]() {
        return this.query;
    }

    constructor(db: pg.Client, query: CompleteSelectQuery<Types, CTE, P, TableTypes, G, S>, cte: TableExpressions<CTE, ExpressionF<{}>>) {
        super(query.returning, (parameters, names, args, types) => toQuery(query, parameters, names, args, types));
        this.db = db;
        this.query = query;
        this.cte = cte;
    }

    union<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "UNION", false, this.db, this.cte, lambda);
    }

    unionAll<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "UNION", true, this.db, this.cte, lambda);
    }

    intersect<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "INTERSECT", false, this.db, this.cte, lambda);
    }

    intersectAll<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "INTERSECT", true, this.db, this.cte, lambda);
    }

    except<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "EXCEPT", false, this.db, this.cte, lambda);
    }

    exceptAll<Q extends ExpressionF<TableSubtype>>(lambda: (cte: TableExpressions<CTE, ExpressionF<{}>>) => AllSelectStatements<Types, {}, P | Q, S>) {
        return CombineStatements<Types, CTE, P | Q, S>(this.query, "EXCEPT", true, this.db, this.cte, lambda);
    }
}

class LimitedSelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends BaseSelectStatement<Types, CTE, P, G, S> {
    offset(offset: number): BaseSelectStatement<Types, CTE, P, G, S> {
        this.query.offset = offset;
        return this;
    }
}

class OrderedSelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends LimitedSelectStatement<Types, CTE, P, G, S> {
    limit(limit: number): LimitedSelectStatement<Types, CTE, P, G, S> {
        this.query.limit = limit;
        return this;
    }
}

export class SelectStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends TableTypes, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends OrderedSelectStatement<Types, CTE, P, G, S> {
    private from: TableExpressions<T, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteSelectQuery<Types, CTE, P, T, G, S>, from: TableExpressions<T, ExpressionF<{}>>, cte: TableExpressions<CTE, ExpressionF<{}>>) {
        super(db, query, cte);
        this.from = from;
    }

    orderBy<Q extends ExpressionF<TableSubtype>>(lambda: (t: TableExpressions<T, ExpressionF<{}>>, g: G) => Expression<SQLType, {} extends G ? boolean : true, Q>[]): OrderedSelectStatement<Types, CTE, P | Q, G, S> {
        return new OrderedSelectStatement<Types, CTE, P | Q, G, S>(this.db, replace(this.query, "orderBy", lambda(this.from, this.query.groups)), this.cte);
    }
}
