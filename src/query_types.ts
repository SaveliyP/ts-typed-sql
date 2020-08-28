import { SQLType } from "./columns";
import { TypeParser, AllTypes } from "./types";

export type TableType = {[key: string]: SQLType};
export type TableSubtype = never;
export type TableTypes = {[key: string]: TableType};

//Represents an expression returning type T, and U represents whether this expression can be used for an entire grouped row in a SELECT statement.
export type Grouped<T extends Expression<SQLType, boolean, ExpressionF<TableSubtype>>> = false extends (T extends Expression<SQLType, infer G, ExpressionF<TableSubtype>> ? G : never) ? false : true;
export class Expression<T extends SQLType, U extends boolean, P extends ExpressionF<TableSubtype>> {
    execute: P;
    return_type: T;
    private grouped: U;
    precedence: number;

    constructor(execute: P, return_type: T, grouped: U, precedence: number) {
        this.execute = execute;
        this.return_type = return_type;
        this.grouped = grouped;
        this.precedence = precedence;
    }

    static allGrouped<T extends Expression<SQLType, boolean, ExpressionF<TableSubtype>>>(x: T[]): Grouped<T> {
        return <Grouped<T>> x.every(x => x.grouped); //WARN: Type-cast
    }
};
export type ExpressionF<T extends TableType> = <Types extends AllTypes>(names: {[key: string]: number}, args: unknown[], types: TypeParser<Types>) => (parameters: {[key in keyof T]: Types[T[key]] | null}) => string;

//This interface represents an instance of a table that has been aliased to a certain name, such as during a FROM clause in a SELECT statement.
export type TableExpression<T extends TableType, P extends ExpressionF<TableSubtype>> = {
    [key in keyof T]: Expression<T[key], false, P>;
};
export type TableExpressions<T extends TableTypes, P extends ExpressionF<TableSubtype>> = {[key in keyof T]: TableExpression<T[key], P>};

//This interface represents anything that can provide a table, such as models, other SELECT statements, or DML statements with a RETURNING clause.
export interface TableProvider<T extends TableType, P extends ExpressionF<TableSubtype>> {
    (): P; //How to get this table (e.g. "tablename" for models or the select statement of a subquery)
    (alias: string): TableExpression<T, ExpressionF<{}>>; //Provides accessors to all columns given the tables new alias
    type: T;
    parameters: P;
}
export type TableProviders<T extends TableTypes, P extends ExpressionF<TableSubtype>> = {[key in keyof T]: TableProvider<T[key], P>};
