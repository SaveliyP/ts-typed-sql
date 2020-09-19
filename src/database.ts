import * as pg from 'pg';
import { SQLType } from './columns';
import { AllTypes, TypeParser } from './types';
import { Expression, ExpressionF, TableProviders, TableSubtype, TableType, TableTypes } from './query_types';
import { TypeMapping } from './utils';
import { TypeSQLExpressions } from './expressions/expressions';
import { op, OpT } from './expressions/operators';
import { WithQuery, WithRQuery } from './queries/base';
import { CombinableStatement } from './queries/select';
import { FromClause } from './queries/common';
import { Model } from './model';
    
function raw<Tp extends AllTypes, T extends SQLType>(types: TypeParser<Tp>, value: Tp[T] | null, type: T): Expression<T, true, ExpressionF<{}>> {
    const exec = function(names: {[key: string]: number}, args: unknown[]) {
        args.push(value == null ? null : types[type].toSQL(value));
        const id = args.length;
        return () => "CAST ($" + id + " AS " + TypeMapping[type] + ")";
    };

    return new Expression(exec, type, true, 99);
}

export class TypeSQL<Types extends AllTypes> {
    private db: pg.Client;
    private types: TypeParser<Types>;

    literal: {[key in SQLType]: (value: Types[key] | null) => Expression<key, true, ExpressionF<{}>>} = {
        smallint: value => raw(this.types, value, "smallint"),
        integer: value => raw(this.types, value, "integer"),
        bigint: value => raw(this.types, value, "bigint"),
        float: value => raw(this.types, value, "float"),
        double: value => raw(this.types, value, "double"),
        numeric: value => raw(this.types, value, "numeric"),
    
        boolean: value => raw(this.types, value, "boolean"),
        bit: value => raw(this.types, value, "bit"),
        binary: value => raw(this.types, value, "binary"),
    
        text: value => raw(this.types, value, "text"),
        enum: value => raw(this.types, value, "enum"),
    
        json: value => raw(this.types, value, "json"),
    
        time: value => raw(this.types, value, "time"),
        date: value => raw(this.types, value, "date"),
        timestamp: value => raw(this.types, value, "timestamp"),
    };
    expression: TypeSQLExpressions<Types>;
    operator: OpT<Types>;

    constructor(client: pg.Client, types: TypeParser<Types>) {
        this.db = client;
        this.types = types;
        this.expression = new TypeSQLExpressions(types);
        this.operator = op(types);
    }

    with<T extends TableProviders<TableTypes, ExpressionF<TableSubtype>>>(tables: T) {
        return new WithQuery<Types, {[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']>(this.db, this.types, tables, false);
    }

    withRecursive<T extends {[key: string]: CombinableStatement<Types, {}, ExpressionF<TableSubtype>, TableType>}>(tables: T) {
        return new WithRQuery<Types, {[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']>(this.db, this.types, tables);
    }
    
    from<T extends FromClause<{}, ExpressionF<TableSubtype>>>(from: T) {
        return new WithQuery<Types, {}, ExpressionF<{}>>(this.db, this.types, {}, false).from(from);
    }

    select<S extends {[key: string]: Expression<SQLType, true, ExpressionF<TableSubtype>>}>(lambda: (t: {}) => S) {
        return new WithQuery<Types, {}, ExpressionF<{}>>(this.db, this.types, {}, false).from({}).select(lambda);
    }

    deleteFrom<D extends TableType>(from: Model<D>) {
        return new WithQuery<Types, {}, ExpressionF<{}>>(this.db, this.types, {}, false).deleteFrom(from);
    }

    into<I extends TableType>(into: Model<I>) {
        return new WithQuery<Types, {}, ExpressionF<{}>>(this.db, this.types, {}, false).into(into);
    }

    update<U extends TableType>(model: Model<U>) {
        return new WithQuery<Types, {}, ExpressionF<{}>>(this.db, this.types, {}, false).update(model);
    }

    raw(sql: string, params?: unknown[]) {
        return this.db.query(sql, params);
    }

    close() {
        return this.db.end();
    }
}

export async function database<Types extends AllTypes>(options: string | pg.ClientConfig, types: TypeParser<Types>) {
    const db = new pg.Client(options);
    await db.connect();
    return new TypeSQL(db, types);
}