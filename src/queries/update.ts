import { Expression, TableExpression, TableProvider, TableProviders, TableType, TableTypes, ExpressionF, TableExpressions } from '../query_types';
import { identifier, replace, createTableProvider, createTableExpression, withParentheses, expressionWithParentheses } from '../utils';
import { Model } from '../model';
import { SelectStatementClass, FromClause, FromClauseType, transformFrom, FromClauseProviders } from './select';
import { SQLType } from '../columns';

import * as pg from 'pg';

interface CompleteUpdateQuery<CTE extends TableTypes, P extends ExpressionF<never>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType> {
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    into: Model<U>;
    using: T;
    set: {[key in keyof V]: Expression<V[key], boolean, P>};
    returning: {[key in keyof R]: Expression<R[key], boolean, P>};
}

function toQuery
<CTE extends TableTypes, P extends ExpressionF<never>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType>
(updateStmt: CompleteUpdateQuery<CTE, P, U, T, V, R>, parameters: never, names: {[key: string]: number}, args: unknown[]): string {
    function getWith() {
        const creation: string[] = [];
        for (const x in updateStmt.cte) {
            creation.push(identifier(x) + " AS (" + updateStmt.cte[x]()(names, args)(parameters) + ")");
        }

        return creation.length > 0 ? ("WITH " + (updateStmt.recursiveWith ? "RECURSIVE " : "") + creation.join(",")) : "";
    }

    function getUpdate() {
        return "UPDATE " + updateStmt.into()(names, args)(parameters) + " AS " + JSON.stringify("__updating");
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
                var parentheses = a instanceof SelectStatementClass;
                fromClause.push(withParentheses(a()(names, args)(parameters), parentheses) + " AS " + identifier(x));
            } else {
                throw Error("Unknown type");
            }
        }
        return fromClause.length > 0 ? ("FROM " + fromClause.join(",")) : "";
    }

    function getValues() {
        const mapper = expressionWithParentheses(4, names, args, parameters);
        return "SET " + Object.keys(updateStmt.set).map(key => {
            return identifier(key) + "=" + mapper(updateStmt.set[key]);
        }).join(",");
    }

    function getReturning() {
        const returning: string[] = [];
        const mapper = expressionWithParentheses(0, names, args, parameters);
        for (const key in updateStmt.returning) {
            returning.push(mapper(updateStmt.returning[key]) + " AS " + identifier(key));
        }
        return returning.length > 0 ? ("RETURNING " + returning.join(",")) : "";
    }

    return [
        getWith(),
        getUpdate(),
        getValues(),
        getUsing(),
        getReturning()
    ].filter(x => x.length > 0).join(" ");
}

type UpdateStatementClass<CTE extends TableTypes, P extends ExpressionF<never>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType> = TableProvider<R, P>;
const UpdateStatementClass = function<CTE extends TableTypes, P extends ExpressionF<never>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType>(this: UpdateStatementClass<CTE, P, U, T, V, R>, query: CompleteUpdateQuery<CTE, P, U, T, V, R>): UpdateStatementClass<CTE, P, U, T, V, R> {
    const AsTableExpression: P = function AsTableExpression(names: {[key: string]: number}, args: unknown[]) {
        return (parameters: never) => toQuery(query, parameters, names, args);
    } as unknown as P; //TODO: type-cast

    const InsertStatementClass = createTableProvider(createTableExpression(query.returning), AsTableExpression);
    Object.setPrototypeOf(InsertStatementClass, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return InsertStatementClass;
} as unknown as new <CTE extends TableTypes, P extends ExpressionF<never>, I extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType>(query: CompleteUpdateQuery<CTE, P, I, T, V, R>) => UpdateStatementClass<CTE, P, I, T, V, R>;

type CalculateParameter<T extends ExpressionF<never>> = [T] extends [ExpressionF<infer P>] ? P : never;
class BaseUpdateStatement<CTE extends TableTypes, P extends ExpressionF<never>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType> extends UpdateStatementClass<CTE, P, U, T, V, R> {
    protected db: pg.Client;
    protected query: CompleteUpdateQuery<CTE, P, U, T, V, R>;
    protected into: TableExpression<U, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteUpdateQuery<CTE, P, U, T, V, R>) {
        super(query);
        this.db = db;
        this.query = query;
        this.into = query.into("__updating");
    }

    async execute(parameters: {[key in keyof CalculateParameter<P>]: CalculateParameter<P>[key]}): Promise<R[]> {
        const args: unknown[] = [];
        const sql = this()({}, args)(<never> parameters); //TODO: type-cast
        console.log("Executing " + sql);
        console.log(args);
        const result = await this.db.query(sql, args);
        console.log(result);
        return result.rows;
    }
}

export class UpdateSetStatement<CTE extends TableTypes, P extends ExpressionF<never>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType> extends BaseUpdateStatement<CTE, P, U, T, V, {}> {
    returning<R extends {[key: string]: Expression<SQLType, boolean, ExpressionF<never>>}>(lambda: (t: TableExpression<U, ExpressionF<{}>>) => R): BaseUpdateStatement<CTE, P | R[keyof R]['execute'], U, T, V, {[key in keyof R]: R[key]['return_type']}> {
        const returning = lambda(this.into);
        const res: CompleteUpdateQuery<CTE, P | R[keyof R]['execute'], U, T, V, {[key in keyof R]: R[key]['return_type']}> = replace(this.query, "returning", returning);
        return new BaseUpdateStatement(this.db, res);
    }
}

type Req<T> = {[key in keyof T]-?: NonNullable<T[key]>};
type OptV<T extends TableType> = {[key in keyof T]?: Expression<T[key], boolean, ExpressionF<never>>};
type OptVT<T extends OptV<TableType>> = {[key in keyof Req<T>]: Req<T>[key]['return_type']};
type OptVP<T extends OptV<TableType>> = Req<T>[keyof Req<T>]['execute'];
export class UpdateFromStatement<CTE extends TableTypes, P extends ExpressionF<never>, U extends TableType, T extends FromClause<CTE, P>> {
    protected db: pg.Client;
    protected query: CompleteUpdateQuery<CTE, P, U, T, {}, {}>;
    protected into: TableExpression<U, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteUpdateQuery<CTE, P, U, T, {}, {}>) {
        this.db = db;
        this.query = query;
        this.into = query.into("__updating");
    }
    set<V extends OptV<U>>(lambda: (t: TableExpression<U, ExpressionF<{}>>, f: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>) => Req<V>): UpdateSetStatement<CTE, P | OptVP<V>, U, T, OptVT<V>> {
        const set = lambda(this.into, transformFrom(this.query.cte, this.query.using));
        return new UpdateSetStatement<CTE, P | OptVP<V>, U, T, OptVT<V>>(this.db, replace(this.query, "set", set));
    }
}

export class UpdateStatement<CTE extends TableTypes, P extends ExpressionF<never>, U extends TableType> extends UpdateFromStatement<CTE, P, U, {}> {
    using<T extends FromClause<CTE, ExpressionF<never>>>(using: T): UpdateFromStatement<CTE, P | FromClauseProviders<T[keyof T]>['parameters'], U, T> {
        return new UpdateFromStatement<CTE, P | FromClauseProviders<T[keyof T]>['parameters'], U, T>(this.db, replace(this.query, "using", using));
    }
}
