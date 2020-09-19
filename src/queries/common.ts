import { TableProviders, TableTypes, ExpressionF, TableSubtype, Expression, TableType, TableProvider, TableExpressions } from "../query_types";
import { identifier, expressionWithParentheses, createTableProvider, createTableExpression } from "../utils";
import { TypeParser, AllTypes } from "../types";
import { Client } from "pg";

export type FromClause<CTE extends TableTypes, P extends ExpressionF<TableSubtype>> = {[key: string]: TableProvider<TableType, P> | keyof CTE};
type ArrFromClause<CTE extends TableTypes, P extends ExpressionF<TableSubtype>> = ((TableProvider<TableType, P> | keyof CTE)[] & {"0": any}) | []; //TODO: From with arrays instead of objects
export type FromClauseType<CTE extends TableTypes, T extends FromClause<CTE, ExpressionF<TableSubtype>>> = {[key in keyof T]: T[key] extends keyof CTE ? CTE[T[key]] : (T[key] extends TableProvider<infer R, ExpressionF<TableSubtype>> ? R : never)};
export type FromClauseProviders<T> = T extends TableProvider<TableType, ExpressionF<TableSubtype>> ? T : never;

export function getWith<Types extends AllTypes, CTE extends TableTypes, P extends ExpressionF<TableSubtype>>(expression: {recursiveWith: boolean, cte: TableProviders<CTE, P>}, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) {
    const creation: string[] = [];
    for (const x in expression.cte) {
        creation.push(identifier(x) + " AS (" + expression.cte[x]()(names, args, types)(parameters) + ")");
    }

    return creation.length > 0 ? ("WITH " + (expression.recursiveWith ? "RECURSIVE " : "") + creation.join(",")) : "";
}

export function getWhere<Types extends AllTypes, P extends ExpressionF<TableSubtype>>(expression: {conditions: Expression<"boolean", boolean, P>[]}, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) {
    return expression.conditions.length > 0 ? "WHERE " + expression.conditions.map(expressionWithParentheses(2, names, args, types, parameters)).join(" AND ") : "";
}

export function getReturning<Types extends AllTypes, P extends ExpressionF<TableSubtype>, R extends TableType>(expression: {returning: {[key in keyof R]: Expression<R[key], boolean, P>}}, parameters: TableSubtype, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) {
    const returning: string[] = [];
    const mapper = expressionWithParentheses(0, names, args, types, parameters);
    for (const key in expression.returning) {
        returning.push(mapper(expression.returning[key]) + " AS " + identifier(key));
    }
    return returning.length > 0 ? ("RETURNING " + returning.join(",")) : "";
}

export function getTableExpressions<CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends FromClause<CTE, P>>(cte: TableProviders<CTE, P>, from: T) {
    const transformed: TableExpressions<FromClauseType<CTE, T>, ExpressionF<{}>> = <any> {}; //WARN: Type-cast
    for (const x in from) {
        const fn = from[x];
        if (typeof fn === 'string') {
            transformed[x] = <any> cte[fn](x); //WARN: Type-cast
        } else {
            transformed[x] = (<any> fn)(x); //WARN: Type-cast
        }
    }

    return transformed;
}

export function getExpressionsFromProviders<T extends TableTypes>(t: TableProviders<T, ExpressionF<TableSubtype>>) {
    const transformed: TableExpressions<T, ExpressionF<{}>> = <any> {}; //WARN: Type-cast

    let key: keyof T;
    for (key in t) {
        transformed[key] = t[key](<string> key); //WARN: Type-cast
    }

    return transformed;
}

export function getFromTableProviders<CTE extends TableTypes, P extends ExpressionF<TableSubtype>, T extends FromClause<CTE, P>>(cte: TableProviders<CTE, P>, from: T) {
    const transformed: TableProviders<FromClauseType<CTE, T>, P> = <any> {}; //WARN: Type-cast

    let key: keyof T;
    for (key in from) {
        const v = from[key];
        if (typeof v === 'string') {
            transformed[key] = <any> createTableProvider(alias => cte[<any> v](alias), () => (parameters: {}) => identifier(v)); //WARN: Type-cast
        } else {
            transformed[key] = <any> v; //WARN: Type-cast
        }
    }

    return transformed;
}

export function getFromCTE<CTE extends TableTypes>(cte: TableProviders<CTE, ExpressionF<TableSubtype>>) {
    const transformed: TableProviders<CTE, ExpressionF<{}>> = <any> {}; //WARN: Type-cast

    let key: keyof CTE & string;
    for (key in cte) {
        transformed[key] = createTableProvider(cte[key], () => (parameters: {}) => identifier(key));
    }

    return transformed;
}

type BaseStatementClass<Types extends AllTypes, P extends ExpressionF<TableSubtype>, R extends TableType> = TableProvider<R, P>;
const BaseStatementClass = function
<Types extends AllTypes, P extends ExpressionF<TableSubtype>, R extends TableType>
(
    this: BaseStatementClass<Types, P, R>,
    returning: {[key in keyof R]: Expression<R[key], boolean, P>},
    toQuery: (parameters: never, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => string
): BaseStatementClass<Types, P, R> {
    const AsTableExpression: P = function AsTableExpression(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) {
        return (parameters: TableSubtype) => toQuery(parameters, names, args, types);
    } as unknown as P; //WARN: Type-cast

    const BaseStatementClass = createTableProvider(createTableExpression(returning), AsTableExpression);
    Object.setPrototypeOf(BaseStatementClass, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return BaseStatementClass;
} as unknown as new <Types extends AllTypes, P extends ExpressionF<TableSubtype>, R extends TableType>
(
    returning: {[key in keyof R]: Expression<R[key], boolean, P>},
    toQuery: (parameters: never, names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => string
) => BaseStatementClass<Types, P, R>;

type CalculateParameter<T extends ExpressionF<TableSubtype>> = [T] extends [ExpressionF<infer P>] ? P : never;
export abstract class BaseStatement<Types extends AllTypes, P extends ExpressionF<TableSubtype>, R extends TableType> extends BaseStatementClass<Types, P, R> {
    protected abstract query: {
        types: TypeParser<Types>;
        returning: {[key in keyof R]: Expression<R[key], boolean, P>};
    };
    protected abstract db: Client;

    async execute(parameters: [P] extends [ExpressionF<{}>] ? (void | {}) : {[key in keyof CalculateParameter<P>]: Types[CalculateParameter<P>[key]] | null}): Promise<{[key in keyof R]: Types[R[key]] | null}[]> {
        const args: unknown[] = [];
        const sql = this()({}, args, this.query.types)(<TableSubtype> parameters); //WARN: Type-cast
        //console.log("Executing query:")
        //console.log({sql, args});
        const result = await this.db.query(sql, args);
        var output = result.rows.map(x => {
            for (var key in this.query.returning) {
                if (x[key] == null) {
                    x[key] = null;
                } else {
                    x[key] = this.query.types[this.query.returning[key].return_type].toJS(x[key]);
                }
            }
            return x;
        });
        return output;
    }
}
export type StatementTables<Types extends AllTypes, P extends ExpressionF<TableSubtype>, T extends TableTypes> = {[key in keyof T]: BaseStatement<Types, P, T[key]>};
