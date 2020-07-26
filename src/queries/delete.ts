import { Expression, TableExpression, TableProvider, TableProviders, TableType, TableTypes, SQLType, ExpressionF } from '../query_types';
import { identifier, replace, expres, mapRawExpression, ToExpression } from '../utils';
import { Model } from '../model';

import * as pg from 'pg';

interface CompleteDeleteQuery<CTE extends TableTypes, P extends ExpressionF<never>, D extends TableType, S extends TableType> {
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    from: Model<D>;
    conditions: Expression<boolean, boolean, P>[];
    returning: {[key in keyof S]: Expression<S[key], boolean, P> | S[key]};
}

function toQuery
<CTE extends TableTypes, P extends ExpressionF<never>, D extends TableType, R extends TableType>
(deleteStmt: CompleteDeleteQuery<CTE, P, D, R>, parameters: never, names: {[key: string]: number}, args: SQLType[]): string {
    function getWith() {
        const creation: string[] = [];
        for (const x in deleteStmt.cte) {
            creation.push(identifier(x) + " AS (" + deleteStmt.cte[x]()(names, args)(parameters) + ")");
        }

        return creation.length > 0 ? ("WITH " + (deleteStmt.recursiveWith ? "RECURSIVE " : "") + creation.join(",")) : "";
    }

    function getFrom() {
        return "DELETE FROM " + deleteStmt.from() + " AS " + JSON.stringify("__deleting");
    }

    function getWhere() {
        return deleteStmt.conditions.length > 0 ? "WHERE " + deleteStmt.conditions.map(mapRawExpression(2, parameters, names, args)).join(" AND ") : "";
    }

    function getReturning() {
        const returning: string[] = [];
        const mapper = mapRawExpression(0, parameters, names, args);
        for (const key in deleteStmt.returning) {
            returning.push(mapper(deleteStmt.returning[key]) + " AS " + identifier(key));
        }
        return returning.length > 0 ? ("RETURNING " + returning.join(",")) : "";
    }

    return [
        getWith(),
        getFrom(),
        getWhere(),
        getReturning()
    ].filter(x => x.length > 0).join(" ");
}

type DeleteStatementClass<CTE extends TableTypes, P extends ExpressionF<never>, D extends TableType, R extends TableType> = TableProvider<R, P>;
const DeleteStatementClass = function<CTE extends TableTypes, P extends ExpressionF<never>, D extends TableType, R extends TableType>(this: DeleteStatementClass<CTE, P, D, R>, query: CompleteDeleteQuery<CTE, P, D, R>): DeleteStatementClass<CTE, P, D, R> {
    const AsTableExpression: P = function AsTableExpression(names: {[key: string]: number}, args: SQLType[]) {
        return (parameters: never) => toQuery(query, parameters, names, args);
    } as unknown as P; //TODO: type-cast

    function DeleteStatementClass(): P;
    function DeleteStatementClass(alias: string): TableExpression<R, P>;
    function DeleteStatementClass(alias?: string): TableExpression<R, P> | P {
        if (alias == null) {
            return AsTableExpression;
        } else {
            var expr: TableExpression<R, P> = <any> {}; //TODO: <any>
            for (let key in query.returning) {
                expr[key] = expres(<any> (() => () => identifier(alias) + "." + identifier(key)), 99); //TODO: <any>
            }
            return expr;
        }
    }
    Object.setPrototypeOf(DeleteStatementClass, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return (function<T>(a: T): T & {type: R, parameters: P} {return <any> a;})(DeleteStatementClass);
} as unknown as new <CTE extends TableTypes, P extends ExpressionF<never>, D extends TableType, R extends TableType>(query: CompleteDeleteQuery<CTE, P, D, R>) => DeleteStatementClass<CTE, P, D, R>;

type CalculateParameter<T extends ExpressionF<never>> = [T] extends [ExpressionF<infer P>] ? P : never;
class BaseDeleteStatement<CTE extends TableTypes, P extends ExpressionF<never>, D extends TableType, R extends TableType> extends DeleteStatementClass<CTE, P, D, R> {
    protected db: pg.Client;
    protected query: CompleteDeleteQuery<CTE, P, D, R>;
    protected from: TableExpression<D, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteDeleteQuery<CTE, P, D, R>) {
        super(query);
        this.db = db;
        this.query = query;
        this.from = query.from("__deleting");
    }

    async execute(parameters: {[key in keyof CalculateParameter<P>]: CalculateParameter<P>[key]}): Promise<R[]> {
        const args: SQLType[] = [];
        const sql = this()({}, args)(<never> parameters); //TODO: type-cast
        console.log("Executing " + sql);
        console.log(args);
        const result = await this.db.query(sql, args);
        console.log(result);
        return result.rows;
    }
}

export class DeleteStatement<CTE extends TableTypes, P extends ExpressionF<never>, D extends TableType> extends BaseDeleteStatement<CTE, P, D, {}> {
    returning<R extends {[key: string]: Expression<SQLType, boolean, ExpressionF<never>> | SQLType}>(lambda: (t: TableExpression<D, ExpressionF<{}>>) => R): BaseDeleteStatement<CTE, P | ToExpression<R[keyof R]>['execute'], D, {[key in keyof R]: ToExpression<R[key]>['return_type']}> {
        const returning = lambda(this.from);
        const res: CompleteDeleteQuery<CTE, P | ToExpression<R[keyof R]>['execute'], D, {[key in keyof R]: ToExpression<R[key]>['return_type']}> = replace(this.query, "returning", returning);
        return new BaseDeleteStatement(this.db, res);
    }

    where<Q extends ExpressionF<never>>(lambda: (t: TableExpression<D, ExpressionF<{}>>) => Expression<boolean, boolean, P | Q>): DeleteStatement<CTE, P | Q, D> {
        return new DeleteStatement(this.db, replace(this.query, "conditions", [...this.query.conditions, lambda(this.from)]));
    }
}
