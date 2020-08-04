import { Expression, TableExpressions, TableProvider, TableProviders, TableType, TableTypes, ExpressionF } from '../query_types';
import { identifier, replace, withParentheses, createTableProvider, createTableExpression, expressionWithParentheses } from '../utils';
import { SQLType } from '../columns';

import * as pg from 'pg';

export type FromClause<CTE extends TableTypes, P extends ExpressionF<never>> = {[key: string]: TableProvider<TableType, P> | keyof CTE};
type ArrFromClause<CTE extends TableTypes, P extends ExpressionF<never>> = ((TableProvider<TableType, P> | keyof CTE)[] & {"0": any}) | [];
export type FromClauseType<CTE extends TableTypes, T extends FromClause<CTE, ExpressionF<never>>> = {[key in keyof T]: T[key] extends keyof CTE ? CTE[T[key]] : (T[key] extends TableProvider<infer R, ExpressionF<never>> ? R : never)};
export type FromClauseProviders<T> = T extends TableProvider<TableType, ExpressionF<never>> ? T : never;

type GroupClause<P extends ExpressionF<never>> = {[key: string]: Expression<SQLType, true, P>};

interface CompleteSelectQuery<CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>, G extends GroupClause<P>, S extends TableType> {
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    from: T;
    conditions: Expression<"boolean", boolean, P>[];
    groups: G;
    groupConditions: Expression<"boolean", true, P>[];
    selected: {[key in keyof S]: Expression<S[key], {} extends G ? boolean : true, P>};
    orderBy: Expression<SQLType, true, P>[];
    limit?: number;
    offset?: number;
}

export function transformFrom<CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>>(cte: TableProviders<CTE, P>, from: T) {
    const transformed: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>> = <any> {}; //TODO: <any> is bad, there probably exists some type that can cause errors
    for (const x in from) {
        const fn = from[x];
        if (typeof fn === 'string') {
            transformed[x] = <any> cte[fn](x); //TODO: <any> is bad
        } else {
            transformed[x] = (<any> fn)(x); //TODO: <any> is bad
        }
    }

    return transformed;
}

function toQuery
<CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType>
(select: CompleteSelectQuery<CTE, P, T, G, S>, parameters: never, names: {[key: string]: number}, args: unknown[]): string {
    const mapper0 = expressionWithParentheses(0, names, args, parameters);
    const mapper2 = expressionWithParentheses(2, names, args, parameters);

    function getWith() {
        const creation: string[] = [];
        for (const x in select.cte) {
            creation.push(identifier(x) + " AS (" + select.cte[x]()(names, args)(parameters) + ")");
        }

        return creation.length > 0 ? ("WITH " + (select.recursiveWith ? "RECURSIVE " : "") + creation.join(",")) : "";
    }

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
                var parentheses = a instanceof SelectStatementClass;
                fromClause.push(withParentheses(a()(names, args)(parameters), parentheses) + " AS " + identifier(x));
            } else {
                throw Error("Unknown type");
            }
        }
        return fromClause.length > 0 ? ("FROM " + fromClause.join(",")) : "";
    }

    function getWhere() {
        return select.conditions.length > 0 ? "WHERE " + select.conditions.map(mapper2).join(" AND ") : "";
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
        for (const key in select.selected) {
            selects.push(mapper0(select.selected[key]) + " AS " + identifier(key));
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
        getWith(),
        getSelect(),
        getFrom(),
        getWhere(),
        getGroupBy(),
        getHaving(),
        getOrderBy(),
        getLimit(),
        getOffset()
    ].filter(x => x.length > 0).join(" ");
}

type ConvertGroupedQuery<Q extends ExpressionF<never>, G extends {[key: string]: Expression<SQLType, boolean, Q>}> = {[key in keyof G]: Expression<G[key]['return_type'], true, G[key]['execute']>};
export class FromQuery<CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>> {
    private db: pg.Client;
    private query: CompleteSelectQuery<CTE, P, T, {}, {}>;
    private from: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>

    constructor(db: pg.Client, query: CompleteSelectQuery<CTE, P, T, {}, {}>) {
        this.db = db;
        this.query = query;
        this.from = transformFrom(query.cte, query.from);
    }

    where<Q extends ExpressionF<never>>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>) => Expression<"boolean", boolean, P | Q>): FromQuery<CTE, P | Q, T> {
        return new FromQuery(this.db, replace(this.query, "conditions", [...this.query.conditions, lambda(this.from)]));
    }

    groupBy<G extends {[key: string]: Expression<SQLType, boolean, ExpressionF<never>>}>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>) => G): GroupedQuery<CTE, P | G[keyof G]['execute'], T, ConvertGroupedQuery<P | G[keyof G]['execute'], G>> {
        const groups: ConvertGroupedQuery<P | G[keyof G]['execute'], G> = <any> lambda(this.from);
        return new GroupedQuery<CTE, P | G[keyof G]['execute'], T, ConvertGroupedQuery<P | G[keyof G]['execute'], G>>(this.db, replace(this.query, "groups", groups), this.from);
    }

    select<S extends {[key: string]: Expression<SQLType, boolean, ExpressionF<never>>}>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>) => S): SelectStatement<CTE, P | S[keyof S]['execute'], T, {}, {[key in keyof S]: S[key]['return_type']}> {
        const select = lambda(this.from);
        const res: CompleteSelectQuery<CTE, P | S[keyof S]['execute'], T, {}, {[key in keyof S]: S[key]['return_type']}> = replace(this.query, "selected", select);
        return new SelectStatement(this.db, res);
    }
}

class GroupedQuery<CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>, G extends GroupClause<P>> {
    private db: pg.Client;
    private query: CompleteSelectQuery<CTE, P, T, G, {}>;
    private from: TableExpressions<FromClauseType<CTE, T>, P>;

    constructor(db: pg.Client, query: CompleteSelectQuery<CTE, P, T, G, {}>, from: TableExpressions<FromClauseType<CTE, T>, P>) {
        this.db = db;
        this.query = query;
        this.from = from;
    }

    having<Q extends ExpressionF<never>>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>, g: G) => Expression<"boolean", true, P | Q>): GroupedQuery<CTE, P | Q, T, G> {
        return new GroupedQuery(this.db, replace(this.query, "groupConditions", [...this.query.groupConditions, lambda(this.from, this.query.groups)]), this.from);
    }

    select<S extends {[key: string]: Expression<SQLType, {} extends G ? boolean : true, ExpressionF<never>>}>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>, groups: G) => S): SelectStatement<CTE, P | S[keyof S]['execute'], T, G, {[key in keyof S]: S[key]['return_type']}> {
        const select = lambda(this.from, this.query.groups);
        const res: CompleteSelectQuery<CTE, P | S[keyof S]['execute'], T, G, {[key in keyof S]: S[key]['return_type']}> = replace(this.query, "selected", select);
        return new SelectStatement(this.db, res);
    }
}

export type SelectStatementClass<CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> = TableProvider<S, P>;
export const SelectStatementClass = function<CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType>(this: SelectStatementClass<CTE, P, T, G, S>, query: CompleteSelectQuery<CTE, P, T, G, S>): SelectStatementClass<CTE, P, T, G, S> {
    const AsTableExpression: P = function AsTableExpression(names: {[key: string]: number}, args: unknown[]) {
        return (parameters: never) => toQuery(query, parameters, names, args);
    } as unknown as P; //TODO: type-cast

    const SelectStatementClass = createTableProvider(createTableExpression(query.selected), AsTableExpression);
    Object.setPrototypeOf(SelectStatementClass, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return SelectStatementClass;
} as unknown as new <CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType>(query: CompleteSelectQuery<CTE, P, T, G, S>) => SelectStatementClass<CTE, P, T, G, S>;

type CalculateParameter<T extends ExpressionF<never>> = [T] extends [ExpressionF<infer P>] ? P : never;
class BaseSelectStatement<CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends SelectStatementClass<CTE, P, T, G, S> {
    protected db: pg.Client;
    protected query: CompleteSelectQuery<CTE, P, T, G, S>;

    constructor(db: pg.Client, query: CompleteSelectQuery<CTE, P, T, G, S>) {
        super(query);
        this.db = db;
        this.query = query;
    }

    async execute(parameters: {[key in keyof CalculateParameter<P>]: CalculateParameter<P>[key]}): Promise<S[]> {
        const args: unknown[] = [];
        const sql = this()({}, args)(<never> parameters); //TODO: type-cast
        console.log("Executing " + sql);
        console.log(args);
        const result = await this.db.query(sql, args);
        console.log(result);
        return result.rows;
    }
}

class LimitedSelectStatement<CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends BaseSelectStatement<CTE, P, T, G, S> {
    offset(offset: number): BaseSelectStatement<CTE, P, T, G, S> {
        this.query.offset = offset;
        return this;
    }
}

class OrderedSelectStatement<CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends LimitedSelectStatement<CTE, P, T, G, S> {
    limit(limit: number): LimitedSelectStatement<CTE, P, T, G, S> {
        this.query.limit = limit;
        return this;
    }
}

export class SelectStatement<CTE extends TableTypes, P extends ExpressionF<never>, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends OrderedSelectStatement<CTE, P, T, G, S> {
    orderBy(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>, g: G) => [Expression<SQLType, {} extends G ? boolean : true, P>]): OrderedSelectStatement<CTE, P, T, G, S> {
        //this.query.orderBy.push(lambda(this., this.query.groups));
        return this;
    }
}
