import { Expression, TableExpression, TableProvider, TableProviders, TableType, TableTypes, ExpressionF, TableExpressions, TableSubtype } from '../query_types';
import { identifier, replace, createTableProvider, createTableExpression, withParentheses, expressionWithParentheses } from '../utils';
import { Model } from '../model';
import { SelectStatementClass, FromClause, FromClauseType, transformFrom, FromClauseProviders } from './select';
import { SQLType } from '../columns';
import { TypeParser, AllTypes } from '../types';

import * as pg from 'pg';

interface CompleteUpdateQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType> {
    types: TypeParser<Types>;
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    into: Model<U>;
    using: T;
    set: {[key in keyof V]: Expression<V[key], boolean, P>};
    returning: {[key in keyof R]: Expression<R[key], boolean, P>};
}

function toQuery
<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType>
(updateStmt: CompleteUpdateQuery<Types, CTE, P, U, T, V, R>, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>): string {
    function getWith() {
        const creation: string[] = [];
        for (const x in updateStmt.cte) {
            creation.push(identifier(x) + " AS (" + updateStmt.cte[x]()(names, args, types)(parameters) + ")");
        }

        return creation.length > 0 ? ("WITH " + (updateStmt.recursiveWith ? "RECURSIVE " : "") + creation.join(",")) : "";
    }

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
                var parentheses = a instanceof SelectStatementClass;
                fromClause.push(withParentheses(a()(names, args, types)(parameters), parentheses) + " AS " + identifier(x));
            } else {
                throw Error("Unknown type");
            }
        }
        return fromClause.length > 0 ? ("FROM " + fromClause.join(",")) : "";
    }

    function getValues() {
        const mapper = expressionWithParentheses(4, names, args, types, parameters);
        return "SET " + Object.keys(updateStmt.set).map(key => {
            return identifier(key) + "=" + mapper(updateStmt.set[key]);
        }).join(",");
    }

    function getReturning() {
        const returning: string[] = [];
        const mapper = expressionWithParentheses(0, names, args, types, parameters);
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

type UpdateStatementClass<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType> = TableProvider<R, P>;
const UpdateStatementClass = function<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType>(this: UpdateStatementClass<Types, CTE, P, U, T, V, R>, query: CompleteUpdateQuery<Types, CTE, P, U, T, V, R>): UpdateStatementClass<Types, CTE, P, U, T, V, R> {
    const AsTableExpression: P = function AsTableExpression(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) {
        return (parameters: TableSubtype) => toQuery(query, parameters, names, args, types);
    } as unknown as P; //TODO: type-cast

    const InsertStatementClass = createTableProvider(createTableExpression(query.returning), AsTableExpression);
    Object.setPrototypeOf(InsertStatementClass, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return InsertStatementClass;
} as unknown as new <Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType>(query: CompleteUpdateQuery<Types, CTE, P, I, T, V, R>) => UpdateStatementClass<Types, CTE, P, I, T, V, R>;

type CalculateParameter<T extends ExpressionF<TableSubtype>> = [T] extends [ExpressionF<infer P>] ? P : never;
class BaseUpdateStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType, R extends TableType> extends UpdateStatementClass<Types, CTE, P, U, T, V, R> {
    protected db: pg.Client;
    protected query: CompleteUpdateQuery<Types, CTE, P, U, T, V, R>;
    protected into: TableExpression<U, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteUpdateQuery<Types, CTE, P, U, T, V, R>) {
        super(query);
        this.db = db;
        this.query = query;
        this.into = query.into("__updating");
    }

    async execute(parameters: {[key in keyof CalculateParameter<P>]: Types[CalculateParameter<P>[key]]}): Promise<{[key in keyof R]: Types[R[key]]}[]> {
        const args: unknown[] = [];
        const sql = this()({}, args, this.query.types)(<TableSubtype> parameters); //TODO: type-cast
        console.log("Executing " + sql);
        console.log(args);
        const result = await this.db.query(sql, args);
        console.log(result);
        var output = result.rows.map(x => {
            for (var key in this.query.returning) {
                x[key] = this.query.types[this.query.returning[key].return_type].toJS(x[key]);
            }
            return x;
        });
        return output;
    }
}

export class UpdateSetStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>, V extends TableType> extends BaseUpdateStatement<Types, CTE, P, U, T, V, {}> {
    returning<R extends {[key: string]: Expression<SQLType, boolean, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpression<U, ExpressionF<{}>>) => R): BaseUpdateStatement<Types, CTE, P | R[keyof R]['execute'], U, T, V, {[key in keyof R]: R[key]['return_type']}> {
        const returning = lambda(this.into);
        const res: CompleteUpdateQuery<Types, CTE, P | R[keyof R]['execute'], U, T, V, {[key in keyof R]: R[key]['return_type']}> = replace(this.query, "returning", returning);
        return new BaseUpdateStatement(this.db, res);
    }
}

type Req<T> = {[key in keyof T]-?: NonNullable<T[key]>};
type OptV<T extends TableType> = {[key in keyof T]?: Expression<T[key], boolean, ExpressionF<TableSubtype>>};
type OptVT<T extends OptV<TableType>> = {[key in keyof Req<T>]: Req<T>[key]['return_type']};
type OptVP<T extends OptV<TableType>> = Req<T>[keyof Req<T>]['execute'];
export class UpdateFromStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType, T extends FromClause<CTE, P>> {
    protected db: pg.Client;
    protected query: CompleteUpdateQuery<Types, CTE, P, U, T, {}, {}>;
    protected into: TableExpression<U, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteUpdateQuery<Types, CTE, P, U, T, {}, {}>) {
        this.db = db;
        this.query = query;
        this.into = query.into("__updating");
    }
    set<V extends OptV<U>>(lambda: (t: TableExpression<U, ExpressionF<{}>>, f: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>>) => Req<V>): UpdateSetStatement<Types, CTE, P | OptVP<V>, U, T, OptVT<V>> {
        const set = lambda(this.into, transformFrom(this.query.cte, this.query.using));
        return new UpdateSetStatement<Types, CTE, P | OptVP<V>, U, T, OptVT<V>>(this.db, replace(this.query, "set", set));
    }
}

export class UpdateStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, U extends TableType> extends UpdateFromStatement<Types, CTE, P, U, {}> {
    using<T extends FromClause<CTE, ExpressionF<TableSubtype>>>(using: T): UpdateFromStatement<Types, CTE, P | FromClauseProviders<T[keyof T]>['parameters'], U, T> {
        return new UpdateFromStatement<Types, CTE, P | FromClauseProviders<T[keyof T]>['parameters'], U, T>(this.db, replace(this.query, "using", using));
    }
}
