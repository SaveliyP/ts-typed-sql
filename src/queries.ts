export type SQLType = string | number | boolean | boolean[] | Buffer | BigInt | Date | Object;

export type TableType = {
    [key: string]: SQLType;
}

//Represents an expression returning type T, and U represents whether this expression can be used for an entire grouped row in a SELECT statement.
export interface Expression<T extends SQLType, U extends boolean> {
    (): string;
    return_type: T;
    grouped: U;
    precedence: number;
};

//This interface represents an instance of a table that has been aliased to a certain name, such as during a FROM clause in a SELECT statement.
export type TableExpression<T extends TableType> = {
    [key in keyof T]: Expression<T[key], false>;
};

//This interface represents anything that can provide a table, such as models, other SELECT statements, or DML statements with a RETURNING clause.
export interface TableProvider<T extends TableType> {
    (): string; //How to get this table (e.g. "tablename" for models or the select statement of a subquery)
    (alias: string): TableExpression<T>; //Provides accessors to all columns given the tables new alias
}