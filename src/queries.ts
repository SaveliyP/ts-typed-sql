export type JSONType = {json: Object};
export type SQLType = string | number | boolean | boolean[] | Buffer | bigint | Date | JSONType;
export type ToSQLType<T> = T extends string ? string : (T extends number ? number : (T extends boolean ? boolean : (T extends boolean[] ? boolean[] : (T extends Buffer ? Buffer : (T extends bigint ? bigint : (T extends Date ? Date : (T extends JSONType ? JSONType : never)))))));

export type TableType = {
    [key: string]: SQLType;
}
export type TableTypes = {[key: string]: TableType};

export interface Value<T extends SQLType> {
    value: T;
}

export interface Parameter<T extends SQLType, K extends string | number | symbol> {
    name: K;
    type: T;
}

export type ExpressionType = (string | Value<SQLType> | Parameter<SQLType, string | number | symbol>);

//Represents an expression returning type T, and U represents whether this expression can be used for an entire grouped row in a SELECT statement.
export type Expression<T extends SQLType, U extends boolean, P extends ExpressionF<never>> = {
    //(): ExpressionType[];
    execute: P;
    return_type: T;
    grouped: U;
    //parameters: P;
    precedence: number;
};
export type ExpressionF<T extends TableType> = (parameters: T, names: {[key: string]: string}, args: SQLType[]) => string;

//This interface represents an instance of a table that has been aliased to a certain name, such as during a FROM clause in a SELECT statement.
export type TableExpression<T extends TableType, P extends TableType> = {
    [key in keyof T]: Expression<T[key], false, P>;
};
export type TableExpressions<T extends TableTypes, P extends TableType> = {[key in keyof T]: TableExpression<T[key], P>};

//This interface represents anything that can provide a table, such as models, other SELECT statements, or DML statements with a RETURNING clause.
export interface TableProvider<T extends TableType, P extends TableType> {
    (): string; //How to get this table (e.g. "tablename" for models or the select statement of a subquery)
    (alias: string): TableExpression<T, P>; //Provides accessors to all columns given the tables new alias
    type: T;
    parameters: P;
}
export type TableProviders<T extends TableTypes, P extends TableType> = {[key in keyof T]: TableProvider<T[key], P>};