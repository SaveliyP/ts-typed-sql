import { Expression, TableExpression, TableProvider, TableProviders, TableType, TableTypes, ExpressionF, TableSubtype } from '../query_types';
import { identifier, replace, createTableProvider, createTableExpression, expressionWithParentheses } from '../utils';
import { Model } from '../model';
import { SelectStatementClass, FromClause } from './select';
import { SQLType } from '../columns';

import * as pg from 'pg';
import { AllTypes, TypeParser } from '../types';

interface CompleteInsertQuery<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends TableType, R extends TableType> {
    types: TypeParser<Types>;
    recursiveWith: boolean;
    cte: TableProviders<CTE, P>;
    into: Model<I>;
    values: {[key in keyof V]: Expression<V[key], boolean, P>}[] | TableProvider<V, P>;
    returning: {[key in keyof R]: Expression<R[key], boolean, P>};
}

function toQuery
<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends TableType, R extends TableType>
(insertStmt: CompleteInsertQuery<Types, CTE, P, I, V, R>, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>): string {
    function getWith() {
        const creation: string[] = [];
        for (const x in insertStmt.cte) {
            creation.push(identifier(x) + " AS (" + insertStmt.cte[x]()(names, args, types)(parameters) + ")");
        }

        return creation.length > 0 ? ("WITH " + (insertStmt.recursiveWith ? "RECURSIVE " : "") + creation.join(",")) : "";
    }

    function getInto() {
        var values: string[];
        if (insertStmt.values instanceof Array) {
            values = Object.keys(insertStmt.values[0]);
        } else {
            values = Object.keys(insertStmt.values(""));
        }
        return "INSERT INTO " + insertStmt.into()(names, args, types)(parameters) + " AS " + JSON.stringify("__inserting") + " (" + values.map(x => JSON.stringify(x)).join(",") + ")";
    }

    function getValues() {
        if (insertStmt.values instanceof Array) {
            const values: string[] = Object.keys(insertStmt.values[0]);
            const mapper = expressionWithParentheses(-99, names, args, types, parameters);
            return "VALUES " + insertStmt.values.map(x => 
                values.map(k => x[k]).map(mapper).join(",")
            ).map(x => "(" + x + ")").join(",");
        } else {
            return insertStmt.values()(names, args, types)(parameters);
        }
    }

    function getReturning() {
        const returning: string[] = [];
        const mapper = expressionWithParentheses(0, names, args, types, parameters);
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

type InsertStatementClass<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends TableType, R extends TableType> = TableProvider<R, P>;
const InsertStatementClass = function<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends TableType, R extends TableType>(this: InsertStatementClass<Types, CTE, P, I, V, R>, query: CompleteInsertQuery<Types, CTE, P, I, V, R>): InsertStatementClass<Types, CTE, P, I, V, R> {
    const AsTableExpression: P = function AsTableExpression(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) {
        return (parameters: TableSubtype) => toQuery(query, parameters, names, args, types);
    } as unknown as P; //TODO: type-cast

    const InsertStatementClass = createTableProvider(createTableExpression(query.returning), AsTableExpression);
    Object.setPrototypeOf(InsertStatementClass, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return InsertStatementClass;
} as unknown as new <Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends TableType, R extends TableType>(query: CompleteInsertQuery<Types, CTE, P, I, V, R>) => InsertStatementClass<Types, CTE, P, I, V, R>;

type CalculateParameter<T extends ExpressionF<TableSubtype>> = [T] extends [ExpressionF<infer P>] ? P : never;
class BaseInsertStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends TableType, R extends TableType> extends InsertStatementClass<Types, CTE, P, I, V, R> {
    protected db: pg.Client;
    protected query: CompleteInsertQuery<Types, CTE, P, I, V, R>;
    protected into: TableExpression<I, ExpressionF<{}>>;

    constructor(db: pg.Client, query: CompleteInsertQuery<Types, CTE, P, I, V, R>) {
        super(query);
        this.db = db;
        this.query = query;
        this.into = query.into("__inserting");
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

export class InsertValuesStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType, V extends TableType> extends BaseInsertStatement<Types, CTE, P, I, V, {}> {
    returning<R extends {[key: string]: Expression<SQLType, boolean, ExpressionF<TableSubtype>>}>(lambda: (t: TableExpression<I, ExpressionF<{}>>) => R): BaseInsertStatement<Types, CTE, P | R[keyof R]['execute'], I, V, {[key in keyof R]: R[key]['return_type']}> {
        const returning = lambda(this.into);
        const res: CompleteInsertQuery<Types, CTE, P | R[keyof R]['execute'], I, V, {[key in keyof R]: R[key]['return_type']}> = replace(this.query, "returning", returning);
        return new BaseInsertStatement(this.db, res);
    }
}

type Req<T> = {[key in keyof T]-?: NonNullable<T[key]>};
type OptV<T extends TableType> = {[key in keyof T]?: Expression<T[key], boolean, ExpressionF<TableSubtype>>};
type OptVT<T extends OptV<TableType>> = {[key in keyof Req<T>]: Req<T>[key]['return_type']};
type OptVP<T extends OptV<TableType>> = Req<T>[keyof Req<T>]['execute'];
export class InsertStatement<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>, I extends TableType> extends InsertValuesStatement<Types, CTE, P, I, {}> {
    insert<V extends OptV<I>>(...values: Req<V>[]): InsertValuesStatement<Types, CTE, P | OptVP<V>, I, OptVT<V>> {
        const res: CompleteInsertQuery<Types, CTE, P | OptVP<V>, I, OptVT<V>, {}> = replace(this.query, "values", values);
        return new InsertValuesStatement(this.db, res);
    }
    insertFrom<Q extends ExpressionF<TableSubtype>, T extends FromClause<{}, P>, G extends {[key: string]: Expression<SQLType, true, P | Q>}, V extends Req<I>>(lambda: (cte: TableProviders<CTE, ExpressionF<{}>>) => SelectStatementClass<Types, {}, P | Q, T, G, V>): InsertValuesStatement<Types, CTE, P | Q, I, V> {
        const cteProviders: TableProviders<CTE, ExpressionF<{}>> = <any> {}; //TODO: <any>

        for (let key in this.query.cte) {
            cteProviders[key] = createTableProvider(this.query.cte[key], ()=> () => identifier(key));
        }
        return new InsertValuesStatement(this.db, replace(this.query, "values", lambda(cteProviders)));
    }
}
