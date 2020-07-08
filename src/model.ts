import { TableExpression, TableProvider, SQLType, TableType } from './queries';
import { Column } from './columns';
import { identifier } from './utils';

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

type ModelClass<T extends TableType> = TableProvider<T> & AbstractModelClass<T>;
const ModelClass =  <new <T extends TableType>(name: string, obj: TableDefinition<T>) => ModelClass<T>>
                    <any>
function<T extends TableType>(name: string, obj: TableDefinition<T>): ModelClass<T> {
    function Model(): string;
    function Model(alias: string): TableExpression<T>;
    function Model(alias?: string): TableExpression<T> | string {
        if (alias == null) {
            return identifier(res.modelName);
        } else {
            var expr: TableExpression<T> = <any> {}; //TODO: <any>
            for (var key in res.columns) {
                (function(key) {
                    expr[key] = <any> (() => identifier(alias) + "." + identifier(key)); //TODO: <any>
                })(key);
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
    
    return ret;
}

type ArrayLength<T, N extends number> = T[] & {length: N};

type KeyCreatorFunc<T extends TableType> = (...keys: (keyof T)[]) => void;
type ForeignKeyReference<V extends number> = {ref: <U extends TableType>(target: Model<U>, ...keys: ArrayLength<keyof U, V>) => void};
type ForeignCreatorFunc<T extends TableType> = <V extends number>(...keys: ArrayLength<keyof T, V>) => ForeignKeyReference<V>;
type KeyCreator<T extends TableType> = (t: {primary: KeyCreatorFunc<T>, unique: KeyCreatorFunc<T>, index: KeyCreatorFunc<T>, foreign: ForeignCreatorFunc<T>, self: Model<T>}) => void;

//Get out of non-TypeScript as soon as possible. Every additional functionality should only operate on Model.
export class Model<T extends TableType> extends ModelClass<T> {
    protected primaryKey: (keyof T)[] = [];
    protected uniqueKeys: (keyof T)[][] = [];
    protected indices: (keyof T)[][] = [];
    protected foreignKeys: {target: Model<any>, from: (keyof T)[], to: (keyof any)[]}[] = [];

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
                        ref: (mdl, ...targetKeys) => {
                            this.foreignKeys.push({
                                target: mdl,
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

    serialize() {
        var columns: {[key in keyof T]: {}} = <any> {};
        return {
            name: this.modelName,
            columns: this.columns,
            primaryKey: this.primaryKey,
            uniqueKey: this.uniqueKeys,
            indices: this.indices,
            foreignKeys: this.foreignKeys
        }
    }
}