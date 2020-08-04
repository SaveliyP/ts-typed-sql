import { SQLType } from "./columns";

export type TableType = {
    [key: string]: SQLType;
}
export type TableTypes = {[key: string]: TableType};

//Represents an expression returning type T, and U represents whether this expression can be used for an entire grouped row in a SELECT statement.
export type Expression<T extends SQLType, U extends boolean, P extends ExpressionF<never>> = {
    execute: P;
    return_type: T;
    grouped: U;
    precedence: number;
};
export type ExpressionF<T extends TableType> = (names: {[key: string]: number}, args: unknown[]) => (parameters: T) => string;

//This interface represents an instance of a table that has been aliased to a certain name, such as during a FROM clause in a SELECT statement.
export type TableExpression<T extends TableType, P extends ExpressionF<never>> = {
    [key in keyof T]: Expression<T[key], false, P>;
};
export type TableExpressions<T extends TableTypes, P extends ExpressionF<never>> = {[key in keyof T]: TableExpression<T[key], P>};

//This interface represents anything that can provide a table, such as models, other SELECT statements, or DML statements with a RETURNING clause.
export interface TableProvider<T extends TableType, P extends ExpressionF<never>> {
    (): P; //How to get this table (e.g. "tablename" for models or the select statement of a subquery)
    (alias: string): TableExpression<T, ExpressionF<{}>>; //Provides accessors to all columns given the tables new alias
    type: T;
    parameters: P;
}
export type TableProviders<T extends TableTypes, P extends ExpressionF<never>> = {[key in keyof T]: TableProvider<T[key], P>};
