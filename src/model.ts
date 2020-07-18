import { TableExpression, TableProvider, SQLType, TableType } from './queries';
import { Column, deserializeColumn } from './columns';
import { identifier, expression } from './utils';
import { dict, str, array, strDict } from 'type-builder';
import { isDeepStrictEqual } from 'util';

export type TableDefinition<T extends TableType> = {
    [key in keyof T]: Column<T[key]>
}

type ModelDefinition<T extends TableType> = {
    [key in keyof T]: ModelColumn<Column<T[key]>>;
}

class ModelColumn<T extends Column<SQLType>> {
    name: string;
    model: ModelClass<any>;
    column: T;

    constructor(name: string, model: ModelClass<any>, column: T) {
        this.name = name;
        this.model = model;
        this.column = column;
    }
}

function mapValues<T extends TableType>(obj: TableDefinition<T>, mdl: ModelClass<T>): ModelDefinition<T> {
    var res: ModelDefinition<T> = <any>{};
    for (var k in obj) {
        res[k] = new ModelColumn(k, mdl, obj[k]);
    }

    return res;
}

declare class AbstractModelClass<T extends TableType> {
    protected modelName: string;
    protected columns: ModelDefinition<T>;
}

type ModelClass<T extends TableType> = TableProvider<T, {}> & AbstractModelClass<T>;
const ModelClass = function<T extends TableType>(this: ModelClass<T>, name: string, obj: TableDefinition<T>): ModelClass<T> {
    function Model(): string;
    function Model(alias: string): TableExpression<T, {}>;
    function Model(alias?: string): TableExpression<T, {}> | string {
        if (alias == null) {
            return identifier(res.modelName);
        } else {
            var expr: TableExpression<T, {}> = <any> {}; //TODO: <any>
            for (var key in res.columns) {
                expr[key] = expression([identifier(alias) + "." + identifier(key)], 99);
            }
            return expr;
        }
    }
    const res = Object.assign(Model, {
        modelName: name,
        columns: <ModelDefinition<T>> <any> null //TODO: <any>
    });
    const ret = <ModelClass<T>> <any> res; //TODO: <any>
    res.columns = mapValues(obj, ret);

    Object.setPrototypeOf(Model, Object.getPrototypeOf(this)); //TODO: rethink better way to implement this
    return ret;
} as unknown as new <T extends TableType>(name: string, obj: TableDefinition<T>) => ModelClass<T>;

type ArrayLength<T, N extends number> = T[] & {length: N};

type KeyCreatorFunc<T extends TableType> = (...keys: Extract<keyof T, string>[]) => void;
type ForeignKeyReference<V extends number> = {ref: <U extends TableType>(target: Model<U>, ...keys: ArrayLength<Extract<keyof U, string>, V>) => void};
type ForeignCreatorFunc<T extends TableType> = <V extends number>(...keys: ArrayLength<Extract<keyof T, string>, V>) => ForeignKeyReference<V>;
type KeyCreator<T extends TableType> = (t: {primary: KeyCreatorFunc<T>, unique: KeyCreatorFunc<T>, index: KeyCreatorFunc<T>, foreign: ForeignCreatorFunc<T>, self: Model<T>}) => void;

type ForeignKey = {
    target: string;
    from: string[];
    to: string[];
};
type ForeignKeyM = {
    target: Model<TableType>;
    from: string[];
    to: string[];
}

//Get out of non-TypeScript as soon as possible. Every additional functionality should only operate on Model.
export class Model<T extends TableType> extends ModelClass<T> {
    protected primaryKey: Extract<keyof T, string>[] = [];
    protected uniqueKeys: Extract<keyof T, string>[][] = [];
    protected indices: Extract<keyof T, string>[][] = [];
    protected foreignKeys: ForeignKeyM[] = [];

    //TODO: Move all migrations to operate outside of Model in migrations.ts
    static fkMap(x: ForeignKeyM) {
        return {
            target: x.target.modelName,
            from: x.from,
            to: x.to
        };
    }

    constructor(name: string, obj: TableDefinition<T>, keys?: KeyCreator<T>) {
        super(name, obj);

        if (keys != null) {
            keys({
                primary: (...keys) => {
                    if (this.primaryKey.length != 0) {
                        throw new Error("Primary key has already been set!");
                    }
                    this.primaryKey = keys;
                }, unique: (...keys) => {
                    this.uniqueKeys.push(keys);
                }, index: (...keys) => {
                    this.indices.push(keys);
                }, foreign: (...selfKeys) => {
                    return {
                        ref: (target, ...targetKeys) => {
                            this.foreignKeys.push({
                                target: target,
                                from: selfKeys,
                                to: targetKeys
                            });
                        }
                    }
                },
                self: this
            });
        }
    }

    static SerializedType = dict({
        name: str,
        columns: strDict(Column.SerializedType),
        primaryKey: array(str),
        uniqueKey: array(array(str)),
        indices: array(array(str)),
        foreignKeys: array(dict({
            target: str,
            from: array(str),
            to: array(str)
        }))
    });

    serialize(): typeof Model.SerializedType.type {
        var columns: (typeof Model.SerializedType)['type']['columns'] = <any> {};
        for (var key in this.columns) {
            columns[key] = this.columns[key].column.serialize();
        }
        return {
            name: this.modelName,
            columns: columns,
            primaryKey: this.primaryKey.map(x => x),
            uniqueKey: this.uniqueKeys.map(x => x.map(y => y)),
            indices: this.indices.map(x => x.map(y => y)),
            foreignKeys: this.foreignKeys.map(x => ({
                target: x.target.modelName,
                from: x.from.map(y => y),
                to: x.to.map(y => y)
            }))
        }
    }

    static deserialize(from: any): Model<TableType> {
        if (!this.SerializedType(from)) {
            throw new Error("Invalid model! " + JSON.stringify(from, null, 4));
        }

        var columns: TableDefinition<TableType> = {};

        for (var key in from.columns) {
            const res = deserializeColumn(from.columns[key]);
            if (res == null) {
                throw new Error("Invalid column on model " + from.name + ": " + key);
            }

            columns[key] = res;
        }

        const ret = new Model(from.name, columns);

        ret.primaryKey = from.primaryKey.map(x => x);
        ret.uniqueKeys = from.uniqueKey.map(x => x.map(y => y));
        ret.indices = from.indices.map(x => x.map(y => y));
        ret.foreignKeys = from.foreignKeys.map(x => ({
            target: <any> {modelName: x.target}, //TODO: temporary solution!
            from: x.from.map(y => y),
            to: x.to.map(y => y)
        }));

        return ret;
    }

    diff(to: Model<TableType>): ModelDiff {
        const last = new Set(Object.keys(this.columns));
        const next = new Set(Object.keys(to.columns));

        function diffKeys<T>(cmp: (a: T, b: T) => number, a: T[], b: T[]): KeyChange<T> {
            a.sort(cmp);
            b.sort(cmp);

            const diff: KeyChange<T> = {
                added: [],
                unchanged: [],
                removed: []
            };

            var i = 0;
            var j = 0;
            while (i < a.length && j < b.length) {
                var k = cmp(a[i], b[j]);
                if (k < 0) {
                    diff.removed.push(a[i]);
                    i++;
                } else if (k > 0) {
                    diff.added.push(b[j]);
                    j++;
                } else {
                    diff.unchanged.push(b[j]);
                    i++;
                    j++;
                }
            }

            return diff;
        }

        const fromPK = this.primaryKey.length > 0 ? [this.primaryKey] : [];
        const toPK = to.primaryKey.length > 0 ? [to.primaryKey] : [];

        return {
            removed: new Set([...last].filter(x => !next.has(x))),
            changed: new Set([...last].filter(x => next.has(x)).filter(x => !isDeepStrictEqual(this.columns[x].column.serialize(), to.columns[x].column.serialize()))),
            added: new Set([...next].filter(x => !last.has(x))),
            keys: {
                primary: diffKeys(cmpKey, fromPK, toPK),
                unique: diffKeys(cmpKey, this.uniqueKeys, to.uniqueKeys),
                indices: diffKeys(cmpKey, this.indices, to.indices),
                foreign: diffKeys(cmpForeignKey, this.foreignKeys.map(Model.fkMap), to.foreignKeys.map(Model.fkMap))
            }
        };
    }

    static getColumnNames(cols: string[]): string {
        return cols.map(identifier).join(",");
    }
    static getConstraintColumnName(name: string): string {
        return name.replace(/(_+)/g, "_$1")
    }
    static getColumnList(cols: string[]): string {
        return cols.map(this.getConstraintColumnName).join("_");
    }
    static getPrimaryConstraintName(model: Model<TableType>): string {
        return "PK_" + this.getConstraintColumnName(model.modelName);
    }
    static getConstraintName(type: "IX" | "UQ", model: Model<TableType>, cols: string[]): string {
        return type + "_" + this.getConstraintColumnName(model.modelName) + "_" + this.getColumnList(cols);
    }
    static getForeignConstraintName(model: Model<TableType>, target: string, cols: string[]): string {
        return "FK_" + this.getConstraintColumnName(model.modelName) + "_" + this.getConstraintColumnName(target) + "_" + this.getColumnList(cols);
    }

    static generateFKAdds(model: Model<TableType>, fks: ForeignKey[]): string[] {
        const post: string[] = [];

        fks.forEach(fk => 
            post.push("ADD CONSTRAINT " + identifier(this.getForeignConstraintName(model, fk.target, fk.from)) + " FOREIGN KEY (" + this.getColumnNames(fk.from) + ") REFERENCES " + identifier(fk.target) + "(" + this.getColumnNames(fk.to) + ")")
        );
        if (post.length > 0) {
            for (var i = 0; i < post.length; i++) {
                post[i] = "\t" + post[i];
            }
            for (var i = 0; i < post.length - 1; i++) {
                post[i] += ",";
            }
            post.unshift("ALTER TABLE " + identifier(model.modelName));
            post[post.length - 1] += ";";
        }

        return post;
    }
    static generateFKDrops(model: Model<TableType>, fks: ForeignKey[]): string[] {
        const pre: string[] = [];
        fks.forEach(fk => 
            pre.push("DROP CONSTRAINT " + identifier(Model.getForeignConstraintName(model, fk.target, fk.from)))
        );
        if (pre.length > 0) {
            for (var i = 0; i < pre.length - 1; i++) {
                pre[i] += ",";
            }
            pre.unshift("ALTER TABLE " + identifier(model.modelName));
            pre[pre.length - 1] += ";";
        }

        return pre;
    }

    static generateUQAdds(model: Model<TableType>, keys: string[][]): string[] {
        const update: string[] = [];
        keys.forEach(x => 
            update.push("CONSTRAINT " + identifier(this.getConstraintName("UQ", model, x)) + " UNIQUE (" + this.getColumnNames(x) + ")")
        );

        return update;
    }
    static generateUQDrops(model: Model<TableType>, keys: string[][]): string[] {
        const update: string[] = [];
        keys.forEach(x => 
            update.push("DROP CONSTRAINT " + identifier(this.getConstraintName("UQ", model, x)))
        );

        return update;
    }

    static migration(from: null, to: Model<TableType>, diffs: SchemaDiff): TableMigration;
    static migration(from: Model<TableType>, to: null, diffs: SchemaDiff): TableMigration;
    static migration(from: Model<TableType>, to: Model<TableType>, diffs: SchemaDiff): TableMigration;
    static migration(from: Model<TableType> | null, to: Model<TableType> | null, diffs: SchemaDiff): {
        pre: string[],
        update: string[],
        post: string[]
    } {
        const pre: string[] = [];
        const update: string[] = [];
        const post: string[] = [];

        if (from == null) {
            if (to == null) {
                throw Error("Can't generate migration from null to null!");
            }

            //Create all columns
            Object.values(to.columns).forEach(col => update.push(identifier(col.name) + " " + col.column.sql()))

            //Add primary key
            if (to.primaryKey.length > 0) {
                update.push("CONSTRAINT " + identifier(this.getPrimaryConstraintName(to)) + " PRIMARY KEY (" + this.getColumnNames(to.primaryKey) + ")");
            }

            //Add unique key constraints
            update.push(...this.generateUQAdds(to, to.uniqueKeys));

            //If there are any commands
            if (update.length > 0) {
                //Indent all commands and add commas between each one
                for (var i = 0; i < update.length; i++) {
                    update[i] = "\t" + update[i];
                }
                for (var i = 0; i < update.length - 1; i++) {
                    update[i] = update[i] + ",";
                }

                //Surround them with CREATE TABLE ( [...] );
                update.unshift("CREATE TABLE " + identifier(to.modelName) + " (");
                update.push(");");
            }

            //Creating an INDEX is non-standard SQL and must be done outside CREATE TABLE
            to.indices.forEach(x => 
                update.push("CREATE INDEX " + identifier(this.getConstraintName("IX", to, x)) + " ON " + identifier(to.modelName) + " (" + x.map(identifier) + ");")
            );

            //Add foreign keys after the table was created so that other required tables also get created
            post.push(...this.generateFKAdds(to, to.foreignKeys.map(this.fkMap)));
        } else if (to == null) {
            //First drop all foreign keys, so we can safely delete other tables without worrying about references
            //Then drop the table
            pre.push(...this.generateFKDrops(from, from.foreignKeys.map(this.fkMap)));
            update.push("DROP TABLE " + identifier(from.modelName) + ";");
        } else {
            const diff = diffs[from.modelName];
            /*All unchanged foreign keys that reference an altered column need to be removed and readded
              to prevent a state when one column has a different type than the one it references.*/
            const refreshedFK = diff.keys.foreign.unchanged.filter(x => x.from.some(y => diff.changed.has(y)) || x.to.some(y => diffs[x.target].changed.has(y)));
            pre.push(...this.generateFKDrops(from, [...diff.keys.foreign.removed, ...refreshedFK]));
            post.push(...this.generateFKAdds(to, [...refreshedFK, ...diff.keys.foreign.added]));

            diff.keys.primary.removed.forEach(x => update.push("DROP CONSTRAINT " + identifier(this.getPrimaryConstraintName(from))));
            update.push(...this.generateUQDrops(from, diff.keys.unique.removed));

            diff.removed.forEach(x => update.push("DROP " + identifier(from.columns[x].name)));
            diff.changed.forEach(x => {
                const last = from.columns[x];
                const next = to.columns[x];

                const lastType = last.column.getSQLType();
                const nextType = next.column.getSQLType();

                const lastNullable = last.column.getNullable();
                const nextNullable = next.column.getNullable();

                const lastDefault = last.column.getDefaultTo();
                const nextDefault = next.column.getDefaultTo();

                if (lastType !== nextType) {
                    update.push("ALTER " + identifier(from.columns[x].name) + " TYPE " + to.columns[x].column.getSQLType())
                }
                if (lastNullable !== nextNullable) {
                    update.push("ALTER " + identifier(from.columns[x].name) + " " + (nextNullable ? "DROP" : "SET") + " NOT NULL")
                }
                if (lastDefault !== nextDefault) {
                    update.push("ALTER " + identifier(from.columns[x].name) + (nextDefault == null ? "DROP DEFAULT" : (" SET DEFAULT " + nextDefault)));
                }
            });
            diff.added.forEach(x => update.push("ADD " + identifier(to.columns[x].name) + " " + to.columns[x].column.sql()));

            update.push(...this.generateUQAdds(to, diff.keys.unique.added).map(x => "ADD " + x));
            diff.keys.primary.added.forEach(x => update.push("ADD CONSTRAINT " + identifier(this.getPrimaryConstraintName(to)) + " PRIMARY KEY (" + this.getColumnNames(to.primaryKey) + ")"));

            //If there are any commands
            if (update.length > 0) {
                //Indent all commands and add commas between each one
                for (var i = 0; i < update.length; i++) {
                    update[i] = "\t" + update[i];
                }
                for (var i = 0; i < update.length - 1; i++) {
                    update[i] = update[i] + ",";
                }

                update.unshift("ALTER TABLE " + identifier(from.modelName) + " (");
                update.push(");");
            }

            //TODO: Dropping indices might cause problems if a foreign key references it or there is a unique key on the same columns
            update.push(...diff.keys.indices.removed.map(x => "DROP INDEX " + identifier(this.getConstraintName("IX", from, x)) + ";"));
            update.push(...diff.keys.indices.added.map(x => "CREATE INDEX " + identifier(this.getConstraintName("IX", to, x)) + " ON " + identifier(to.modelName) + "(" + this.getColumnList(x) + ");"));
        }
        return {pre, update, post};
    }
}

interface TableMigration {
    pre: string[];
    update: string[];
    post: string[];
};

interface KeyChange<T> {
    added: T[];
    unchanged: T[];
    removed: T[];
};

interface ModelDiff {
    removed: Set<string>;
    changed: Set<string>;
    added: Set<string>;
    keys: {
        primary: KeyChange<string[]>;
        indices: KeyChange<string[]>;
        unique: KeyChange<string[]>;
        foreign: KeyChange<ForeignKey>;
    };
}

interface SchemaDiff {
    [key: string]: ModelDiff;
}

interface Schema {
    [key: string]: Model<TableType>;
}

function cmpKey(a: string[], b: string[]) {
    var min = Math.min(a.length, b.length);
    for (var i = 0; i < min; i++) {
        if (a[i] < b[i]) {
            return -1;
        } else if (a[i] > b[i]) {
            return 1;
        }
    }
    if (a.length > min) {
        return 1;
    } else if (b.length > min) {
        return -1;
    }
    return 0;
}

function cmpForeignKey(a: ForeignKey, b: ForeignKey): number {
    if (a.target < b.target) {
        return -1;
    } else if (b.target < a.target) {
        return 1;
    }

    var from = cmpKey(a.from, b.from);
    if (from != 0) {
        return from;
    }
    return cmpKey(a.to, b.to);
}

export function generateMigration(last: Schema, next: Schema) {
    const lastModels = new Set(Object.keys(last));
    const nextModels = new Set(Object.keys(next));

    const removedModels = [...lastModels].filter(x => !nextModels.has(x));
    var changedModels = [...lastModels].filter(x => nextModels.has(x));
    const addedModels = [...nextModels].filter(x => !lastModels.has(x));

    var diff: SchemaDiff = {};

    changedModels.forEach(x => diff[x] = last[x].diff(next[x]));
    changedModels = changedModels.filter(x => 
        [diff[x].added, diff[x].changed, diff[x].removed].some(y => y.size > 0) ||
        [diff[x].keys.primary, diff[x].keys.indices, diff[x].keys.unique, diff[x].keys.foreign].some(y => 
            [y.added, y.removed].some(z => z.length > 0)
        )
    );

    const changes = [...removedModels, ...addedModels, ...changedModels].map(x => Model.migration(last[x], next[x], diff));

    var sql = "";

    changes.forEach(x => {
        sql += x.pre.map(x => x + "\n").join("");
    });
    changes.forEach(x => {
        sql += x.update.map(x => x + "\n").join("");
    });
    changes.forEach(x => {
        sql += x.post.map(x => x + "\n").join("");
    });

    return sql;
}
