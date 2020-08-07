import { Expression, TableExpression, TableProvider, TableProviders, TableType, TableTypes, ExpressionF, TableSubtype } from '../query_types';
import { identifier, replace, createTableProvider, createTableExpression, expressionWithParentheses } from '../utils';
import { Model } from '../model';
import { SQLType } from '../columns';
import { AllTypes, TypeParser } from '../types';

import * as pg from 'pg';

interface CompleteDeleteQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, D extends TableType, R extends TableType> {
    types: TypeParser<Types>,
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    from: Model<D>;
    conditions: Expression<"boolean", boolean, P>[];
    returning: {[key in keyof R]: Expression<R[key], boolean, P>};
}

function toQuery
<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, D extends TableType, R extends TableType>
(deleteStmt: CompleteDeleteQuery<Types, CTE, P, D, R>, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>): string {
    function getWith() {
        const creation: string[] = [];
        for (const x in deleteStmt.cte) {
            creation.push(identifier(x) + " AS (" + deleteStmt.cte[x]()(names, args, types)(parameters) + ")");
        }

        return creation.length > 0 ? ("WITH " + (deleteStmt.recursiveWith ? "RECURSIVE " : "") + creation.join(",")) : "";
    }

    function getFrom() {
        return "DELETE FROM " + deleteStmt.from()(names, args, types)(parameters) + " AS " + JSON.stringify("__deleting");
    }

    function getWhere() {
        const mapper = expressionWithParentheses(2, names, args, types, parameters);
        return deleteStmt.conditions.length > 0 ? "WHERE " + deleteStmt.conditions.map(mapper).join(" AND ") : "";
    }

    function getReturning() {
        const returning: string[] = [];
        const mapper = expressionWithParentheses(0, names, args, types, parameters);
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

type DeleteStatementClass<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, D extends TableType, R extends TableType> = TableProvider<R, P>;
const DeleteStatementClass = function<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, D extends TableType, R extends TableType>(this: DeleteStatementClass<Types, CTE, P, D, R>, query: CompleteDeleteQuery<Types, CTE, P, D, R>): DeleteStatementClass<Types, CTE, P, D, R> {
    const AsTableExpression: P = function AsTableExpression(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) {
        return (parameters: TableSubtype) => toQuery(query, parameters, names, args, types);
    } as unknown as P; //TODO: type-cast

    const DeleteStatementClass = createTableProvider(createTableExpression(query.returning), AsTableExpression);
    Object.setPrototypeOf(DeleteStatementClass, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return DeleteStatementClass;
} as unknown as new <Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, D extends TableType, R extends TableType>(query: CompleteDeleteQuery<Types, CTE, P, D, R>) => DeleteStatementClass<Types, CTE, P, D, R>;

type CalculateParameter<T extends ExpressionF<TableSubtype>> = [T] extends [ExpressionF<infer P>] ? P : never;
class BaseDeleteStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, D extends TableType, R extends TableType> extends DeleteStatementClass<Types, CTE, P, D, R> {
    protected db: pg.Client;
    protected query: CompleteDeleteQuery<Types, CTE, P, D, R>;
    protected from: TableExpression<D, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteDeleteQuery<Types, CTE, P, D, R>) {
        super(query);
        this.db = db;
        this.query = query;
        this.from = query.from("__deleting");
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

export class DeleteStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, D extends TableType> extends BaseDeleteStatement<Types, CTE, P, D, {}> {
    returning<R extends {[key: string]: Expression<SQLType, boolean, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpression<D, ExpressionF<{}>>) => R): BaseDeleteStatement<Types, CTE, P | R[keyof R]['execute'], D, {[key in keyof R]: R[key]['return_type']}> {
        const returning = lambda(this.from);
        const res: CompleteDeleteQuery<Types, CTE, P | R[keyof R]['execute'], D, {[key in keyof R]: R[key]['return_type']}> = replace(this.query, "returning", returning);
        return new BaseDeleteStatement(this.db, res);
    }

    where<Q extends ExpressionF<TableSubtype>>(lambda: (t: TableExpression<D, ExpressionF<{}>>) => Expression<"boolean", boolean, P | Q>): DeleteStatement<Types, CTE, P | Q, D> {
        return new DeleteStatement(this.db, replace(this.query, "conditions", [...this.query.conditions, lambda(this.from)]));
    }
}
