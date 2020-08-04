import { TableProviders, TableTypes, ExpressionF, Expression, TableType } from "../query_types";
import { WithQuery } from "./base";
import { SelectStatement, FromQuery, FromClause } from "./select";
import { DeleteStatement } from "./delete";
import { Model } from "../model";
import { SQLType } from "../columns";

import * as pg from "pg";

export default function(db: pg.Client) {
    return {
        withT<T extends TableProviders<TableTypes, ExpressionF<never>>>(tables: T): WithQuery<{[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']> {
            return new WithQuery<{[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']>(db, tables, false);
        },
        withRecursive<T extends TableProviders<TableTypes, ExpressionF<never>>>(tables: T): WithQuery<{[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']> {
            return new WithQuery<{[key in keyof T]: T[key]['type']}, T[keyof T]['parameters']>(db, tables, true);
        },
        
        from<T extends FromClause<{}, ExpressionF<never>>>(from: T): FromQuery<{}, T[keyof T]['parameters'], T> {
            return new WithQuery<{}, ExpressionF<{}>>(db, {}, false).from(from);
        },
        select<S extends {[key: string]: Expression<SQLType, true, ExpressionF<never>>}>(lambda: (t: {}) => S): SelectStatement<{}, S[keyof S]['execute'], {}, {}, {[key in keyof S]: S[key]['return_type']}> {
            return new WithQuery<{}, ExpressionF<{}>>(db, {}, false).from({}).select(lambda);
        },

        deleteFrom<D extends TableType>(from: Model<D>): DeleteStatement<{}, ExpressionF<{}>, D> {
            return new WithQuery<{}, ExpressionF<{}>>(db, {}, false).deleteFrom(from);
        },

        into<I extends TableType>(into: Model<I>) {
            return new WithQuery<{}, ExpressionF<{}>>(db, {}, false).into(into);
        },

        update<U extends TableType>(model: Model<U>) {
            return new WithQuery<{}, ExpressionF<{}>>(db, {}, false).update(model);
        }                                                       
    };
}