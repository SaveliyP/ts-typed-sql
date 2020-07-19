import { Expression, TableExpression, TableExpressions, TableProvider, TableProviders, TableType, TableTypes, SQLType, ExpressionF } from './queries';
import { identifier, expression, replace, repl } from './utils';

import * as pg from 'pg';

type FromClause<CTE extends TableTypes, P extends TableType> = {[key: string]: TableProvider<TableType, P> | keyof CTE};
type ArrFromClause<CTE extends TableTypes, P extends TableType> = ((TableProvider<TableType, P> | keyof CTE)[] & {"0": any}) | [];
type FromClauseType<CTE extends TableTypes, T extends FromClause<CTE, TableType>> = {[key in keyof T]: T[key] extends keyof CTE ? CTE[T[key]] : (T[key] extends TableProvider<infer R, TableType> ? R : never)};

type GroupClause<P extends TableType> = {[key: string]: Expression<SQLType, true, ExpressionF<never>>};

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

interface CompleteSelectQuery<CTE extends TableTypes, P extends TableType, T extends FromClause<CTE, P>, G extends GroupClause<P>, S extends TableType> {
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    from: T;
    conditions: Expression<boolean, boolean, P>[];
    groups: G;
    groupConditions: Expression<boolean, true, P>[];
    selected: {[key in keyof S]: Expression<S[key], {} extends G ? boolean : true, P> | S[key]};
    orderBy: (Expression<SQLType, true, P>)[];
    limit?: number;
    offset?: number;
}

function transformFrom<CTE extends TableTypes, P extends TableType, T extends FromClause<CTE, P>>(cte: TableProviders<CTE, P>, from: T) {
    const transformed: TableExpressions<FromClauseType<CTE, T>, P> = <any> {}; //TODO: <any> is bad, there probably exists some type that can cause errors
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

function toQuery<CTE extends TableTypes, P extends TableType, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType>(select: CompleteSelectQuery<CTE, P, T, G, S>): SelectQuery {
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
        const orderedBy: string[] = select.orderBy.map(x => exprToStr(x, 0)).map(x => x);
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

export class WithQuery<CTE extends TableTypes, P extends TableType> {
    private db: pg.Client;
    private query: CompleteSelectQuery<CTE, P, {}, {}, {}>; 

    constructor(db: pg.Client, query: CompleteSelectQuery<CTE, P, {}, {}, {}>) {
        this.db = db;
        this.query = query;
    }

    from<Q extends {}, T extends FromClause<CTE, P | Q>>(from: T): FromQuery<CTE, P | Q, T> {
        return new FromQuery<CTE, P | Q, T>(this.db, replace(this.query, "from", from));
    }
}

type ConvertGroupedQuery<Q extends TableType, G extends {[key: string]: Expression<SQLType, boolean, Q>}> = {[key in keyof G]: Expression<G[key]['return_type'], true, G[key]['parameters']>};
export class FromQuery<CTE extends TableTypes, P extends TableType, T extends FromClause<CTE, P>> {
    private db: pg.Client;
    private query: CompleteSelectQuery<CTE, P, T, {}, {}>;
    private from: TableExpressions<FromClauseType<CTE, T>, P>

    constructor(db: pg.Client, query: CompleteSelectQuery<CTE, P, T, {}, {}>) {
        this.db = db;
        this.query = query;
        this.from = transformFrom(query.cte, query.from);
    }

    where<Q extends {}>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>) => Expression<boolean, boolean, P | Q>): FromQuery<CTE, P | Q, T> {
        return new FromQuery(this.db, replace(this.query, "conditions", [...this.query.conditions, lambda(this.from)]));
    }

    groupBy<Q extends {}, G extends {[key: string]: Expression<SQLType, boolean, P | Q>}>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>) => G): GroupedQuery<CTE, P | Q, T, ConvertGroupedQuery<P | Q, G>> {
        const groups: ConvertGroupedQuery<P | Q, G> = <any> lambda(this.from);
        return new GroupedQuery<CTE, P | Q, T, ConvertGroupedQuery<P | Q, G>>(this.db, replace(this.query, "groups", groups), this.from);
    }

    select<Q extends {}, S extends TableType>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>) => {[key in keyof S]: Expression<S[key], boolean, P | Q> | S[key]}): SelectStatement<CTE, P | Q, T, {}, S> {
        const select = lambda(this.from);
        return new SelectStatement(this.db, replace(this.query, "selected", select));
    }
}

class GroupedQuery<CTE extends TableTypes, P extends TableType, T extends FromClause<CTE, P>, G extends GroupClause<P>> {
    private db: pg.Client;
    private query: CompleteSelectQuery<CTE, P, T, G, {}>;
    private from: TableExpressions<FromClauseType<CTE, T>, P>;

    constructor(db: pg.Client, query: CompleteSelectQuery<CTE, P, T, G, {}>, from: TableExpressions<FromClauseType<CTE, T>, P>) {
        this.db = db;
        this.query = query;
        this.from = from;
    }

    having<Q extends {}>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>, g: G) => Expression<boolean, true, P | Q>): GroupedQuery<CTE, P | Q, T, G> {
        return new GroupedQuery(this.db, replace(this.query, "groupConditions", [...this.query.groupConditions, lambda(this.from, this.query.groups)]), this.from);
    }

    select<Q extends {}, S extends TableType>(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>, groups: G) => {[key in keyof S]: Expression<S[key], {} extends G ? boolean : true, P | Q>}): SelectStatement<CTE, P | Q, T, G, S> {
        const select = lambda(this.from, this.query.groups);
        return new SelectStatement(this.db, replace(this.query, "selected", select));
    }
}

type SelectStatementClass<CTE extends TableTypes, P extends TableType, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> = TableProvider<S, P>;
const SelectStatementClass = function<CTE extends TableTypes, P extends TableType, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType>(this: SelectStatementClass<CTE, P, T, G, S>, query: CompleteSelectQuery<CTE, P, T, G, S>): SelectStatementClass<CTE, P, T, G, S> {
    const finalSQL = toSQL(toQuery(query));

    function SelectStatementClass(): string;
    function SelectStatementClass(alias: string): TableExpression<S, P>;
    function SelectStatementClass(alias?: string): TableExpression<S, P> | string {
        if (alias == null) {
            return finalSQL;
        } else {
            var expr: TableExpression<S, P> = <any> {}; //TODO: <any>
            for (var key in query.selected) {
                expr[key] = expression([identifier(alias), ".", identifier(key)], 99);
            }
            return expr;
        }
    }
    Object.setPrototypeOf(SelectStatementClass, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return (function<T>(a: T): T & {type: S, parameters: P} {return <any> a;})(SelectStatementClass);
} as unknown as new <CTE extends TableTypes, P extends TableType, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType>(query: CompleteSelectQuery<CTE, P, T, G, S>) => SelectStatementClass<CTE, P, T, G, S>;

class BaseSelectStatement<CTE extends TableTypes, P extends TableType, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends SelectStatementClass<CTE, P, T, G, S> {
    protected db: pg.Client;
    protected query: CompleteSelectQuery<CTE, P, T, G, S>;

    constructor(db: pg.Client, query: CompleteSelectQuery<CTE, P, T, G, S>) {
        super(query);
        this.db = db;
        this.query = query;
    }

    async execute(a: (P extends any ? (a: P) => void : never) extends (a: infer Q) => void ? Q : never): Promise<S[]> {
        console.log("Executing " + this());
        const result = await this.db.query(this());
        console.log(result);
        return result.rows;
    }
}

class LimitedSelectStatement<CTE extends TableTypes, P extends {}, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends BaseSelectStatement<CTE, P, T, G, S> {
    offset(offset: number): BaseSelectStatement<CTE, P, T, G, S> {
        this.query.offset = offset;
        return this;
    }
}

class OrderedSelectStatement<CTE extends TableTypes, P extends {}, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends LimitedSelectStatement<CTE, P, T, G, S> {
    limit(limit: number): LimitedSelectStatement<CTE, P, T, G, S> {
        this.query.limit = limit;
        return this;
    }
}

export class SelectStatement<CTE extends TableTypes, P extends {}, T extends FromClause<CTE, P>, G extends {[key: string]: Expression<SQLType, true, P>}, S extends TableType> extends OrderedSelectStatement<CTE, P, T, G, S> {
    orderBy(lambda: (t: TableExpressions<FromClauseType<CTE, T>, P>, g: G) => [Expression<SQLType, {} extends G ? boolean : true, P>]): OrderedSelectStatement<CTE, P, T, G, S> {
        //this.query.orderBy.push(lambda(this., this.query.groups));
        return this;
    }
}

export default function(db: pg.Client) {
    //TODO: wrong mental model, WITH can only take from generated tables, so Models are a level above "TableProvider"
    //TODO: can WITH take from temporary tables?
    return {
        withT<T extends TableProviders<TableTypes, {}>>(tables: T): WithQuery<{[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']> {
            const hack: TableProviders<{[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']> = tables;
            return new WithQuery(db, {
                recursiveWith: false,
                cte: hack,
                from: {},
                conditions: [],
                groups: {},
                groupConditions: [],
                selected: {},
                orderBy: []
            });
        },
        withRecursive<T extends TableProviders<TableTypes, {}>>(tables: T): WithQuery<{[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']> {
            const hack: TableProviders<{[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']> = tables;
            return new WithQuery(db, {
                recursiveWith: true,
                cte: hack,
                from: {},
                conditions: [],
                groups: {},
                groupConditions: [],
                selected: {},
                orderBy: []
            });
        },
        
        from<P extends {}, T extends FromClause<{}, P>>(from: T): FromQuery<{}, P, T> {
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

        select<Q extends {}, S extends TableType>(lambda: (t: {}) => {[key in keyof S]: Expression<S[key], true, Q> | S[key]}): SelectStatement<{}, Q, {}, {}, S> {
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
