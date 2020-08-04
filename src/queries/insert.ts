import { Expression, TableExpression, TableProvider, TableProviders, TableType, TableTypes, ExpressionF } from '../query_types';
import { identifier, replace, createTableProvider, createTableExpression, expressionWithParentheses } from '../utils';
import { Model } from '../model';
import { SelectStatementClass, FromClause } from './select';
import { SQLType } from '../columns';

import * as pg from 'pg';

interface CompleteInsertQuery<CTE extends TableTypes, P extends ExpressionF<never>, I extends TableType, V extends TableType, R extends TableType> {
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    into: Model<I>;
    values: {[key in keyof V]: Expression<V[key], boolean, P>}[] | TableProvider<V, P>;
    returning: {[key in keyof R]: Expression<R[key], boolean, P>};
}

function toQuery
<CTE extends TableTypes, P extends ExpressionF<never>, I extends TableType, V extends TableType, R extends TableType>
(insertStmt: CompleteInsertQuery<CTE, P, I, V, R>, parameters: never, names: {[key: string]: number}, args: unknown[]): string {
    function getWith() {
        const creation: string[] = [];
        for (const x in insertStmt.cte) {
            creation.push(identifier(x) + " AS (" + insertStmt.cte[x]()(names, args)(parameters) + ")");
        }

        return creation.length > 0 ? ("WITH " + (insertStmt.recursiveWith ? "RECURSIVE " : "") + creation.join(",")) : "";
    }

    function getInto() {
        return "INSERT INTO " + insertStmt.into()(names, args)(parameters) + " AS " + JSON.stringify("__inserting");
    }

    function getValues() {
        if (insertStmt.values instanceof Array) {
            const values: string[] = Object.keys(insertStmt.values[0]);
            const mapper = expressionWithParentheses(-99, names, args, parameters);
            return "VALUES " + insertStmt.values.map(x => 
                values.map(k => x[k]).map(mapper).join(",")
            ).map(x => "(" + x + ")").join(",");
        } else {
            return insertStmt.values()(names, args)(parameters);
        }
    }

    function getReturning() {
        const returning: string[] = [];
        const mapper = expressionWithParentheses(0, names, args, parameters);
        for (const key in insertStmt.returning) {
            returning.push(mapper(insertStmt.returning[key]) + " AS " + identifier(key));
        }
        return returning.length > 0 ? ("RETURNING " + returning.join(",")) : "";
    }

    return [
        getWith(),
        getInto(),
        getValues(),
        getReturning()
    ].filter(x => x.length > 0).join(" ");
}

type InsertStatementClass<CTE extends TableTypes, P extends ExpressionF<never>, I extends TableType, V extends TableType, R extends TableType> = TableProvider<R, P>;
const InsertStatementClass = function<CTE extends TableTypes, P extends ExpressionF<never>, I extends TableType, V extends TableType, R extends TableType>(this: InsertStatementClass<CTE, P, I, V, R>, query: CompleteInsertQuery<CTE, P, I, V, R>): InsertStatementClass<CTE, P, I, V, R> {
    const AsTableExpression: P = function AsTableExpression(names: {[key: string]: number}, args: unknown[]) {
        return (parameters: never) => toQuery(query, parameters, names, args);
    } as unknown as P; //TODO: type-cast

    const InsertStatementClass = createTableProvider(createTableExpression(query.returning), AsTableExpression);
    Object.setPrototypeOf(InsertStatementClass, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return InsertStatementClass;
} as unknown as new <CTE extends TableTypes, P extends ExpressionF<never>, I extends TableType, V extends TableType, R extends TableType>(query: CompleteInsertQuery<CTE, P, I, V, R>) => InsertStatementClass<CTE, P, I, V, R>;

type CalculateParameter<T extends ExpressionF<never>> = [T] extends [ExpressionF<infer P>] ? P : never;
class BaseInsertStatement<CTE extends TableTypes, P extends ExpressionF<never>, I extends TableType, V extends TableType, R extends TableType> extends InsertStatementClass<CTE, P, I, V, R> {
    protected db: pg.Client;
    protected query: CompleteInsertQuery<CTE, P, I, V, R>;
    protected into: TableExpression<I, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteInsertQuery<CTE, P, I, V, R>) {
        super(query);
        this.db = db;
        this.query = query;
        this.into = query.into("__inserting");
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

export class InsertValuesStatement<CTE extends TableTypes, P extends ExpressionF<never>, I extends TableType, V extends TableType> extends BaseInsertStatement<CTE, P, I, V, {}> {
    returning<R extends {[key: string]: Expression<SQLType, boolean, ExpressionF<never>>}>(lambda: (t: TableExpression<I, ExpressionF<{}>>) => R): BaseInsertStatement<CTE, P | R[keyof R]['execute'], I, V, {[key in keyof R]: R[key]['return_type']}> {
        const returning = lambda(this.into);
        const res: CompleteInsertQuery<CTE, P | R[keyof R]['execute'], I, V, {[key in keyof R]: R[key]['return_type']}> = replace(this.query, "returning", returning);
        return new BaseInsertStatement(this.db, res);
    }
}

type Req<T> = {[key in keyof T]-?: NonNullable<T[key]>};
type OptV<T extends TableType> = {[key in keyof T]?: Expression<T[key], boolean, ExpressionF<never>>};
type OptVT<T extends OptV<TableType>> = {[key in keyof Req<T>]: Req<T>[key]['return_type']};
type OptVP<T extends OptV<TableType>> = Req<T>[keyof Req<T>]['execute'];
export class InsertStatement<CTE extends TableTypes, P extends ExpressionF<never>, I extends TableType> extends InsertValuesStatement<CTE, P, I, {}> {
    insert<V extends OptV<I>>(...values: Req<V>[]): InsertValuesStatement<CTE, P | OptVP<V>, I, OptVT<V>> {
        const res: CompleteInsertQuery<CTE, P | OptVP<V>, I, OptVT<V>, {}> = replace(this.query, "values", values);
        return new InsertValuesStatement(this.db, res);
    }
    insertFrom<Q extends ExpressionF<never>, T extends FromClause<{}, P>, G extends {[key: string]: Expression<SQLType, true, P | Q>}, V extends Req<I>>(lambda: (cte: TableProviders<CTE, ExpressionF<{}>>) => SelectStatementClass<{}, P | Q, T, G, V>): InsertValuesStatement<CTE, P | Q, I, V> {
        const cteProviders: TableProviders<CTE, ExpressionF<{}>> = <any> {}; //TODO: <any>

        for (let key in this.query.cte) {
            cteProviders[key] = createTableProvider(this.query.cte[key], ()=> () => identifier(key));
        }
        return new InsertValuesStatement(this.db, replace(this.query, "values", lambda(cteProviders)));
    }
}
