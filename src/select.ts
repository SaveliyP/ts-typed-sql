import { Expression, TableExpression, TableProvider, TableType, SQLType } from './queries';
import { identifier, exprToStr, expression, replace } from './utils';

import * as pg from 'pg';

type TableTypes = {[key: string]: TableType};
type TableProviders<T extends TableTypes> = {[key in keyof T]: TableProvider<T[key]>};
type TableExpressions<T extends TableTypes> = {[key in keyof T]: TableExpression<T[key]>};

type FromClause<CTE extends TableTypes> = {[key: string]: TableProvider<TableType> | keyof CTE};
type ArrFromClause<CTE extends TableTypes> = ((TableProvider<TableType> | keyof CTE)[] & {"0": any}) | [];
type FromClauseType<CTE extends TableTypes, T extends FromClause<CTE>> = {[key in keyof T]: T[key] extends keyof CTE ? CTE[T[key]] : (T[key] extends TableProvider<infer R> ? R : never)};

interface SelectQuery {
    with: string;
    select: string;
    from: string;
    where: string;
    groupBy: string;
    having: string;
    orderBy: string;
    limit: string;
    offset: string;
}

interface CompleteSelectQuery<CTE extends TableTypes, T extends FromClause<CTE>, G extends {[key: string]: Expression<SQLType, true>}, S extends TableType> {
    recursiveWith: boolean;
    cte: TableProviders<CTE>;
    from: T;
    conditions: Expression<boolean, boolean>[];
    groups: G;
    groupConditions: Expression<boolean, true>[];
    selected: {[key in keyof S]: Expression<S[key], {} extends G ? boolean : true> | S[key]};
    orderBy: (Expression<SQLType, true>)[];
    limit?: number;
    offset?: number;
}

function transformFrom<CTE extends TableTypes, T extends FromClause<CTE>>(cte: TableProviders<CTE>, from: T) {
    const transformed: TableExpressions<FromClauseType<CTE, T>> = <any> {}; //TODO: <any> is bad, there probably exists some type that can cause errors
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

function toQuery<CTE extends TableTypes, T extends FromClause<CTE>, G extends {[key: string]: Expression<SQLType, true>}, S extends TableType>(select: CompleteSelectQuery<CTE, T, G, S>): SelectQuery {
    function getWith() {
        const creation: string[] = [];
        for (const x in select.cte) {
            creation.push(identifier(x) + " AS (" + select.cte[x]() + ")");
        }

        return creation.length > 0 ? ("WITH " + (select.recursiveWith ? "RECURSIVE " : "") + creation.join(",")) : "";
    }

    function getFrom() {
        const fromClause: string[] = [];
        for (const x in select.from) {
            const fn = select.from[x];
            if (typeof fn === 'string') {
                fromClause.push(identifier(<string> fn) + " AS " + identifier(x));
            } else {
                fromClause.push((<any> fn)() + " AS " + identifier(x)); //TODO: <any> is bad
            }
        }
        return fromClause.length > 0 ? ("FROM " + fromClause.join(",")) : "";
    }

    function getWhere() {
        return select.conditions.length > 0 ? "WHERE " + select.conditions.map(x => exprToStr(x, 2)).join(" AND ") : "";
    }

    function getGroupBy() {
        const groups = Object.values(select.groups);
        return groups.length > 0 ? "GROUP BY " + groups.map(x => x()).join(",") : "";
    }

    function getHaving() {
        return select.groupConditions.length > 0 ? "HAVING " + select.groupConditions.map(x => exprToStr(x, 2)).join(" AND ") : "";
    }

    function getSelect() {
        const selects: string[] = [];
        for (const key in select.selected) {
            selects.push(exprToStr(select.selected[key], 0) + " AS " + identifier(key));
        }
        if (selects.length == 0) {
            throw Error("Must select at least one value!");
        }
        return "SELECT " + selects.join(",");
    }

    function getOrderBy() {
        const orderedBy: string[] = select.orderBy.map(x => exprToStr(x, 0));
        return orderedBy.length > 0 ? "ORDER BY " + orderedBy.join(","): "";
    }

    function getLimit() {
        return select.limit != null ? "LIMIT " + select.limit : "";
    }

    function getOffset() {
        return select.offset != null ? "OFFSET " + select.offset : "";
    }

    return {
        with: getWith(),
        select: getSelect(),
        from: getFrom(),
        where: getWhere(),
        groupBy: getGroupBy(),
        having: getHaving(),
        orderBy: getOrderBy(),
        limit: getLimit(),
        offset: getOffset()
    };
}

function toSQL(query: SelectQuery): string {
    return [
        query.with,
        query.select,
        query.from,
        query.where,
        query.groupBy,
        query.having,
        query.orderBy,
        query.limit,
        query.offset
    ].filter(x => x.length > 0).join(" ");
}

export class WithQuery<CTE extends TableTypes> {
    private db: pg.Client;
    private query: CompleteSelectQuery<CTE, {}, {}, {}>;

    constructor(db: pg.Client, query: CompleteSelectQuery<CTE, {}, {}, {}>) {
        this.db = db;
        this.query = query;
    }

    from<T extends FromClause<CTE>>(from: T): FromQuery<CTE, T> {
        return new FromQuery(this.db, replace(this.query, "from", from));
    }
}

export class FromQuery<CTE extends TableTypes, T extends FromClause<CTE>> {
    private db: pg.Client;
    private query: CompleteSelectQuery<CTE, T, {}, {}>;
    private from: TableExpressions<FromClauseType<CTE, T>>

    constructor(db: pg.Client, query: CompleteSelectQuery<CTE, T, {}, {}>) {
        this.db = db;
        this.query = query;
        this.from = transformFrom(query.cte, query.from);
    }

    where(lambda: (t: TableExpressions<FromClauseType<CTE, T>>) => Expression<boolean, boolean>): this {
        this.query.conditions.push(lambda(this.from));
        return this;
    }

    groupBy<G extends {[key: string]: Expression<SQLType, boolean>}>(lambda: (t: TableExpressions<FromClauseType<CTE, T>>) => G) {
        const groups = lambda(this.from);
        return new GroupedQuery(this.db, replace(this.query, "groups", <{[key in keyof G]: G[key] extends Expression<infer R, boolean> ? Expression<R, true> : never}> <any>groups), this.from);
    }

    select<S extends TableType>(lambda: (t: TableExpressions<FromClauseType<CTE, T>>) => {[key in keyof S]: Expression<S[key], boolean> | S[key]}): SelectStatement<CTE, T, {}, S> {
        const select = lambda(this.from);
        return new SelectStatement(this.db, replace(this.query, "selected", select));
    }
}

class GroupedQuery<CTE extends TableTypes, T extends FromClause<CTE>, G extends {[key: string]: Expression<SQLType, true>}> {
    private db: pg.Client;
    private query: CompleteSelectQuery<CTE, T, G, {}>;
    private from: TableExpressions<FromClauseType<CTE, T>>;

    constructor(db: pg.Client, query: CompleteSelectQuery<CTE, T, G, {}>, from: TableExpressions<FromClauseType<CTE, T>>) {
        this.db = db;
        this.query = query;
        this.from = from;
    }

    having(lambda: (t: TableExpressions<FromClauseType<CTE, T>>, g: G) => Expression<boolean, true>): this {
        this.query.groupConditions.push(lambda(this.from, this.query.groups));
        return this;
    }

    select<S extends TableType>(lambda: (t: TableExpressions<FromClauseType<CTE, T>>, groups: G) => {[key in keyof S]: Expression<S[key], {} extends G ? boolean : true>}): SelectStatement<CTE, T, G, S> {
        const select = lambda(this.from, this.query.groups);
        return new SelectStatement(this.db, replace(this.query, "selected", select));
    }
}

type SelectStatementClass<CTE extends TableTypes, T extends FromClause<CTE>, G extends {[key: string]: Expression<SQLType, true>}, S extends TableType> = TableProvider<S>;
const SelectStatementClass = function<CTE extends TableTypes, T extends FromClause<CTE>, G extends {[key: string]: Expression<SQLType, true>}, S extends TableType>(this: SelectStatementClass<CTE, T, G, S>, query: CompleteSelectQuery<CTE, T, G, S>): SelectStatementClass<CTE, T, G, S> {
    const finalSQL = toSQL(toQuery(query));

    function SelectStatementClass(): string;
    function SelectStatementClass(alias: string): TableExpression<S>;
    function SelectStatementClass(alias?: string): TableExpression<S> | string {
        if (alias == null) {
            return finalSQL;
        } else {
            var expr: TableExpression<S> = <any> {}; //TODO: <any>
            for (var key in query.selected) {
                expr[key] = expression(identifier(alias) + "." + identifier(key), 99);
            }
            return expr;
        }
    }
    Object.setPrototypeOf(SelectStatementClass, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return SelectStatementClass;
} as unknown as new <CTE extends TableTypes, T extends FromClause<CTE>, G extends {[key: string]: Expression<SQLType, true>}, S extends TableType>(query: CompleteSelectQuery<CTE, T, G, S>) => SelectStatementClass<CTE, T, G, S>;

class BaseSelectStatement<CTE extends TableTypes, T extends FromClause<CTE>, G extends {[key: string]: Expression<SQLType, true>}, S extends TableType> extends SelectStatementClass<CTE, T, G, S> {
    protected db: pg.Client;
    protected query: CompleteSelectQuery<CTE, T, G, S>;

    constructor(db: pg.Client, query: CompleteSelectQuery<CTE, T, G, S>) {
        super(query);
        this.db = db;
        this.query = query;
    }

    async execute(): Promise<S[]> {
        console.log("Executing " + this());
        const result = await this.db.query(this());
        console.log(result);
        return result.rows;
    }
}

class LimitedSelectStatement<CTE extends TableTypes, T extends FromClause<CTE>, G extends {[key: string]: Expression<SQLType, true>}, S extends TableType> extends BaseSelectStatement<CTE, T, G, S> {
    offset(offset: number): BaseSelectStatement<CTE, T, G, S> {
        this.query.offset = offset;
        return this;
    }
}

class OrderedSelectStatement<CTE extends TableTypes, T extends FromClause<CTE>, G extends {[key: string]: Expression<SQLType, true>}, S extends TableType> extends LimitedSelectStatement<CTE, T, G, S> {
    limit(limit: number): LimitedSelectStatement<CTE, T, G, S> {
        this.query.limit = limit;
        return this;
    }
}

export class SelectStatement<CTE extends TableTypes, T extends FromClause<CTE>, G extends {[key: string]: Expression<SQLType, true>}, S extends TableType> extends OrderedSelectStatement<CTE, T, G, S> {
    orderBy(lambda: (t: TableExpressions<FromClauseType<CTE, T>>, g: G) => [Expression<SQLType, {} extends G ? boolean : true>]): OrderedSelectStatement<CTE, T, G, S> {
        //this.query.orderBy.push(lambda(this., this.query.groups));
        return this;
    }
}

export default function(db: pg.Client) {
    //TODO: wrong mental model, WITH can only take from generated tables, so Models are a level above "TableProvider"
    //TODO: can WITH take from temporary tables?
    return {
        withT<CTE extends TableTypes>(tables: TableProviders<CTE>): WithQuery<CTE> {
            return new WithQuery(db, {
                recursiveWith: false,
                cte: tables,
                from: {},
                conditions: [],
                groups: {},
                groupConditions: [],
                selected: {},
                orderBy: []
            });
        },
        
        withRecursive<CTE extends TableTypes>(tables: TableProviders<CTE>): WithQuery<CTE> {
            return new WithQuery(db, {
                recursiveWith: true,
                cte: tables,
                from: {},
                conditions: [],
                groups: {},
                groupConditions: [],
                selected: {},
                orderBy: []
            });
        },
        
        from<T extends FromClause<{}>>(from: T): FromQuery<{}, T> {
            return new FromQuery(db, {
                recursiveWith: false,
                cte: {},
                from: from,
                conditions: [],
                groups: {},
                groupConditions: [],
                selected: {},
                orderBy: []
            });
        },

        select<S extends TableType>(lambda: (t: {}) => {[key in keyof S]: Expression<S[key], true> | S[key]}): SelectStatement<{}, {}, {}, S> {
            const selected = lambda({});
            return new SelectStatement(db, {
                recursiveWith: false,
                cte: {},
                from: {},
                conditions: [],
                groups: {},
                groupConditions: [],
                selected: selected,
                orderBy: []
            });
        }
    };
}