import { Expression, TableExpression, TableProvider, TableType, SQLType } from './queries';
import { identifier } from './utils';

type TableTypes = {[key: string]: TableType};
type TableProviders<T extends TableTypes> = {[key in keyof T]: TableProvider<T[key]>};
type TableExpressions<T extends TableTypes> = {[key in keyof T]: TableExpression<T[key]>};

type FromClause<CTE extends TableTypes> = {[key: string]: TableProvider<TableType> | keyof CTE};
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

export class BeginQuery {
    static with<CTE extends TableTypes>(tables: TableProviders<CTE>): WithQuery<CTE> {
        var creation: string[] = [];
        for (var x in tables) {
            creation.push("(" + tables[x]() + ") AS " + identifier(x));
        }
        const query = {
            with: creation.length > 0 ? ("WITH " + creation.join(",")) : "",
            select: "",
            from: "",
            where: "",
            groupBy: "",
            having: "",
            orderBy: "",
            limit: "",
            offset: ""
        };
        return new WithQuery(query, tables);
    }

    static withRecursive<CTE extends TableTypes>(tables: TableProviders<CTE>): WithQuery<CTE> {
        var creation: string[] = [];
        for (var x in tables) {
            creation.push("(" + tables[x]() + ") AS " + identifier(x));
        }
        const query = {
            with: "WITH RECURSIVE " + creation.join(","),
            select: "",
            from: "",
            where: "",
            groupBy: "",
            having: "",
            orderBy: "",
            limit: "",
            offset: ""
        };
        return new WithQuery(query, tables);
    }

    static from<T extends FromClause<{}>>(from: T) {
        return this.with({}).from(from);
    }
}

class WithQuery<CTE extends TableTypes> {
    private query: SelectQuery;
    private cte: TableProviders<CTE>;

    constructor(query: SelectQuery, cte: TableProviders<CTE>) {
        this.query = query;
        this.cte = cte;
    }

    from<T extends FromClause<CTE>>(from: T): FromQuery<FromClauseType<CTE, T>> {
        var transformed: TableExpressions<FromClauseType<CTE, T>> = <any> {}; //TODO: <any> is bad, there probably exists some type that can cause errors
        var fromClause: string[] = [];
        for (var x in from) {
            const fn = from[x];
            if (typeof fn === 'function') {
                fromClause.push((<any> fn)() + " AS " + identifier(x));
                transformed[x] = (<any> fn)(x); //TODO: <any> is bad
            } else {
                fromClause.push(identifier(<string> fn) + " AS " + identifier(x));
                transformed[x] = <any> this.cte[<keyof CTE> fn](x); //TODO: <any> is bad
            }
        }
        this.query.from = "FROM " + fromClause.join(",");
        return new FromQuery(this.query, transformed);
    }
}

class FromQuery<T extends TableTypes> {
    private query: SelectQuery;
    private from: TableExpressions<T>;
    private conditions: string[] = [];

    constructor(query: SelectQuery, from: TableExpressions<T>) {
        this.query = query;
        this.from = from;
    }

    where(lambda: (t: TableExpressions<T>) => Expression<boolean, boolean>): this {
        this.conditions.push(lambda(this.from)());
        return this;
    }

    groupBy<G extends {[key: string]: Expression<SQLType, boolean>}>(lambda: (t: TableExpressions<T>) => G) {
        if (this.conditions.length > 0) {
            this.query.where = "WHERE " + this.conditions.map(x => "(" + x + ")").join(" AND ");
        }
        const groups = lambda(this.from);
        return new GroupedQuery(this.query, this.from, <{[key in keyof G]: G[key] extends Expression<infer R, boolean> ? Expression<R, true> : never}> <any> groups);
    }
}

class GroupedQuery<T extends TableTypes, G extends {[key: string]: Expression<SQLType, true>}> {
    private query: SelectQuery;
    private from: TableExpressions<T>;
    private groups: G;
    private groupConditions: string[] = [];

    constructor(query: SelectQuery, from: TableExpressions<T>, groups: G) {
        this.query = query;
        this.from = from;
        this.groups = groups;
    }

    having(lambda: (t: TableExpressions<T>, g: G) => Expression<boolean, true>): this {
        this.groupConditions.push(lambda(this.from, this.groups)());
        return this;
    }

    select<S extends TableType>(lambda: (t: TableExpressions<T>, groups: G) => {[key in keyof S]: Expression<S[key], true>}): SelectStatement<S> {
        if (this.groupConditions.length > 0) {
            this.query.having = "HAVING " + this.groupConditions.map(x => "(" + x + ")").join(" AND ");
        }

        const select = lambda(this.from, this.groups);
        var selects: string[] = [];
        for (var key in select) {
            selects.push("(" + select[key]() + ") AS " + identifier(key));
        }
        this.query.select = "SELECT " + selects.join(",");

        const finalQuery = [this.query.with, this.query.select, this.query.from, this.query.where, this.query.groupBy, this.query.having, this.query.orderBy, this.query.limit, this.query.offset].filter(x => x.length > 0).join(" ");

        function SelectStatement(): string;
        function SelectStatement(alias: string): TableExpression<S>;
        function SelectStatement(alias?: string): string | TableExpression<S> {
            if (alias == null) {
                return finalQuery;
            } else {
                var expr: TableExpression<S> = <any> {}; //TODO: <any>
                for (var key in select) {
                    (function(key) {
                        expr[key] = <any> (() => identifier(alias) + "." + identifier(key)); //TODO: <any>
                    })(key);
                }
                return expr;
            }
        }

        return Object.assign(SelectStatement, {
            execute(): Promise<S[]> {
                return new Promise((resolve, reject) => {
                    reject(finalQuery);
                });
            }
        });
    }
}

type SelectStatement<T extends TableType> = TableProvider<T> & {
    execute(): Promise<T[]>
};