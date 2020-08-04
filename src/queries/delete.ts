import { Expression, TableExpression, TableProvider, TableProviders, TableType, TableTypes, ExpressionF } from '../query_types';
import { identifier, replace, createTableProvider, createTableExpression, expressionWithParentheses } from '../utils';
import { Model } from '../model';
import { SQLType } from '../columns';

import * as pg from 'pg';

interface CompleteDeleteQuery<CTE extends TableTypes, P extends ExpressionF<never>, D extends TableType, R extends TableType> {
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    from: Model<D>;
    conditions: Expression<"boolean", boolean, P>[];
    returning: {[key in keyof R]: Expression<R[key], boolean, P>};
}

function toQuery
<CTE extends TableTypes, P extends ExpressionF<never>, D extends TableType, R extends TableType>
(deleteStmt: CompleteDeleteQuery<CTE, P, D, R>, parameters: never, names: {[key: string]: number}, args: any[]): string {
    function getWith() {
        const creation: string[] = [];
        for (const x in deleteStmt.cte) {
            creation.push(identifier(x) + " AS (" + deleteStmt.cte[x]()(names, args)(parameters) + ")");
        }

        return creation.length > 0 ? ("WITH " + (deleteStmt.recursiveWith ? "RECURSIVE " : "") + creation.join(",")) : "";
    }

    function getFrom() {
        return "DELETE FROM " + deleteStmt.from()(names, args)(parameters) + " AS " + JSON.stringify("__deleting");
    }

    function getWhere() {
        const mapper = expressionWithParentheses(2, names, args, parameters);
        return deleteStmt.conditions.length > 0 ? "WHERE " + deleteStmt.conditions.map(mapper).join(" AND ") : "";
    }

    function getReturning() {
        const returning: string[] = [];
        const mapper = expressionWithParentheses(0, names, args, parameters);
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
    const AsTableExpression: P = function AsTableExpression(names: {[key: string]: number}, args: unknown[]) {
        return (parameters: never) => toQuery(query, parameters, names, args);
    } as unknown as P; //TODO: type-cast

    const DeleteStatementClass = createTableProvider(createTableExpression(query.returning), AsTableExpression);
    Object.setPrototypeOf(DeleteStatementClass, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return DeleteStatementClass;
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
        const args: unknown[] = [];
        const sql = this()({}, args)(<never> parameters); //TODO: type-cast
        console.log("Executing " + sql);
        console.log(args);
        const result = await this.db.query(sql, args);
        console.log(result);
        return result.rows;
    }
}

export class DeleteStatement<CTE extends TableTypes, P extends ExpressionF<never>, D extends TableType> extends BaseDeleteStatement<CTE, P, D, {}> {
    returning<R extends {[key: string]: Expression<SQLType, boolean, ExpressionF<never>>}>(lambda: (t: TableExpression<D, ExpressionF<{}>>) => R): BaseDeleteStatement<CTE, P | R[keyof R]['execute'], D, {[key in keyof R]: R[key]['return_type']}> {
        const returning = lambda(this.from);
        const res: CompleteDeleteQuery<CTE, P | R[keyof R]['execute'], D, {[key in keyof R]: R[key]['return_type']}> = replace(this.query, "returning", returning);
        return new BaseDeleteStatement(this.db, res);
    }

    where<Q extends ExpressionF<never>>(lambda: (t: TableExpression<D, ExpressionF<{}>>) => Expression<"boolean", boolean, P | Q>): DeleteStatement<CTE, P | Q, D> {
        return new DeleteStatement(this.db, replace(this.query, "conditions", [...this.query.conditions, lambda(this.from)]));
    }
}
