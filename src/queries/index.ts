import { TableProviders, TableTypes, ExpressionF, Expression, TableType, TableSubtype } from "../query_types";
import { WithQuery } from "./base";
import { FromClause } from "./select";
import { Model } from "../model";
import { SQLType } from "../columns";
import { TypeParser } from "../types";

import * as pg from "pg";

export default function<Types extends {[key in SQLType]: unknown}>(db: pg.Client, types: TypeParser<Types>) {
    return {
        withT<T extends TableProviders<TableTypes, ExpressionF<TableSubtype>>>(tables: T) {
            return new WithQuery<Types, {[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']>(db, types, tables, false);
        },
        withRecursive<T extends TableProviders<TableTypes, ExpressionF<TableSubtype>>>(tables: T) {
            return new WithQuery<Types, {[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']>(db, types, tables, true);
        },
        
        from<T extends FromClause<{}, ExpressionF<TableSubtype>>>(from: T) {
            return new WithQuery<Types, {}, ExpressionF<{}>>(db, types, {}, false).from(from);
        },
        select<S extends {[key: string]: Expression<SQLType, true, ExpressionF<TableSubtype>>}>(lambda: (t: {}) => S) {
            return new WithQuery<Types, {}, ExpressionF<{}>>(db, types, {}, false).from({}).select(lambda);
        },

        deleteFrom<D extends TableType>(from: Model<D>) {
            return new WithQuery<Types, {}, ExpressionF<{}>>(db, types, {}, false).deleteFrom(from);
        },

        into<I extends TableType>(into: Model<I>) {
            return new WithQuery<Types, {}, ExpressionF<{}>>(db, types, {}, false).into(into);
        },

        update<U extends TableType>(model: Model<U>) {
            return new WithQuery<Types, {}, ExpressionF<{}>>(db, types, {}, false).update(model);
        }                                                       
    };
}