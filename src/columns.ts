import { TypeChecker, dict, optional, bool, str, intersection, num, array, union } from 'type-builder';

export interface Day {
    year: number;
    month: number;
    day: number;
}

export type SQLType = "integer" | "biginteger" | "text" | "float" | "boolean" | "date" | "datetime" | "time" | "timestamp"| "binary" | "enum" | "json" | "uuid";

function ColumnType<T extends string, U extends {}>(x: {SerializedType: TypeChecker<U>}, y: T) {
    return intersection([
        dict({
            type: y
        }), x.SerializedType
    ]);
}

export abstract class Column<T extends SQLType> {
    static SerializedType = dict({
        nullable: optional(bool),
        defaultTo: optional(str)
    });
    abstract type: T;

    protected isNullable?: boolean;
    protected shouldDefaultTo?: string;

    nullable(): void {
        this.isNullable = true;
    }

    nonNullable(): void {
        this.isNullable = false;
    }

    defaultTo(defaultTo: string): void { //TODO: change defaultTo to be an expression
        this.shouldDefaultTo = defaultTo;
    }

    abstract getSQLType(): string;
    getNullable(): boolean | undefined {
        return this.isNullable;
    }
    getDefaultTo(): string | undefined {
        return this.shouldDefaultTo;
    }

    sql(): string {
        const ret = [this.getSQLType()];

        if (this.isNullable === true) {
            ret.push("NULL");
        } else if (this.isNullable === false) {
            ret.push("NOT NULL");
        }

        if (this.shouldDefaultTo != null) {
            ret.push("DEFAULT " + this.shouldDefaultTo);
        }

        return ret.join(" ");
    }

    //abstract createColumn(): string;
    serialize(): typeof Column.SerializedType.type {
        return {
            nullable: this.isNullable,
            defaultTo: this.shouldDefaultTo
        };
    }

    deserialize(options: typeof Column.SerializedType.type) {
        this.isNullable = options.nullable;
        this.shouldDefaultTo = options.defaultTo;
    }
}

abstract class LengthColumn<T extends SQLType> extends Column<T> {
    static SerializedType = intersection([
        dict({
            length: optional(num)
        }), Column.SerializedType
    ]);
    protected length?: number;

    constructor(length?: number) {
        super();
        this.length = length;
    }

    protected getLengthType(): string {
        return this.length == null ? "" : ("(" + this.length + ")");
    }

    serialize(): typeof LengthColumn.SerializedType.type {
        return {
            length: this.length,
            ...super.serialize()
        };
    }

    deserialize(options: typeof LengthColumn.SerializedType.type) {
        super.deserialize(options);
        this.length = options.length;
    }
}

abstract class TimeColumn<T extends SQLType> extends Column<T> {
    static SerializedType = intersection([
        dict({
            useTz: optional(bool),
            precision: optional(num)
        }), Column.SerializedType
    ]);
    protected useTz?: boolean;
    protected precision?: number;

    constructor(options?: {useTz?: boolean, precision?: number}) {
        super();
        this.useTz = options?.useTz;
        this.precision = options?.precision;
    }

    serialize(): typeof TimeColumn.SerializedType.type {
        return {
            useTz: this.useTz,
            precision: this.precision,
            ...super.serialize()
        };
    }

    deserialize(options: typeof TimeColumn.SerializedType.type) {
        super.deserialize(options);
        this.useTz = options.useTz;
        this.precision = options.precision;
    }
}

export class DBIncrements extends Column<"integer"> {
    static SerializedType = ColumnType(Column, "increments");

    type: "integer" = "integer";

    fromJS = (data: number) => data.toString();
    toJS = Number.parseInt;
    
    getSQLType() {
        return "SERIAL";
    }

    serialize(): typeof DBIncrements.SerializedType.type {
        return {
            type: "increments",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBIncrements | null {
        if (this.SerializedType(options)) {
            const ret = new DBIncrements()
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBInteger extends LengthColumn<"integer"> {
    static SerializedType = ColumnType(LengthColumn, "integer");
    
    type: "integer" = "integer";

    fromJS = (data: number) => data.toString();
    toJS = Number.parseInt;

    getSQLType() {
        return "INT" + this.getLengthType();
    }

    serialize(): typeof DBInteger.SerializedType.type {
        return {
            type: "integer",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBInteger | null {
        if (this.SerializedType(options)) {
            const ret = new DBInteger()
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBBigIncrements extends Column<"biginteger"> {
    static SerializedType = ColumnType(Column, "bigincrements");

    type: "biginteger" = "biginteger";

    fromJS = (data: bigint) => data.toString();
    toJS = BigInt;

    getSQLType() {
        return "BIGSERIAL";
    }

    serialize(): typeof DBBigIncrements.SerializedType.type {
        return {
            type: "bigincrements",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBBigIncrements | null {
        if (this.SerializedType(options)) {
            const ret = new DBBigIncrements()
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBBigInteger extends LengthColumn<"biginteger"> {
    static SerializedType = ColumnType(LengthColumn, "biginteger");

    type: "biginteger" = "biginteger";

    fromJS = (data: bigint) => data.toString();
    toJS = BigInt;

    getSQLType() {
        return "BIGINT" + this.getLengthType();
    }

    serialize(): typeof DBBigInteger.SerializedType.type {
        return {
            type: "biginteger",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBBigInteger | null {
        if (this.SerializedType(options)) {
            const ret = new DBBigInteger();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBText extends Column<"text"> {
    static SerializedType = intersection([
        dict({
            type: "text",
            textType: optional(union(["text", "mediumtext", "longtext"]))
        }), Column.SerializedType
    ]);

    type: "text" = "text";

    fromJS = (x: string) => x;
    toJS = (x: string) => x;

    protected textType?: "text" | "mediumtext" | "longtext";

    constructor(textType?: "text" | "mediumtext" | "longtext") {
        super();
        this.textType = textType;
    }

    getSQLType() {
        return this.textType == null ? "TEXT" : this.textType.toUpperCase();
    }

    serialize(): typeof DBText.SerializedType.type {
        return {
            type: "text",
            textType: this.textType,
            ...super.serialize()
        };
    }

    deserialize(options: typeof DBText.SerializedType.type) {
        super.deserialize(options);
        this.textType = options.textType;
    }

    static deserialize(options: any): DBText | null {
        if (this.SerializedType(options)) {
            const ret = new DBText();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBString extends LengthColumn<"text"> {
    static SerializedType = ColumnType(LengthColumn, "string");

    type: "text" = "text";

    fromJS = (data: string) => data;
    toJS = (data: string) => data;

    getSQLType() {
        return "VARCHAR" + this.getLengthType();
    }

    serialize(): typeof DBString.SerializedType.type {
        return {
            type: "string",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBString | null {
        if (this.SerializedType(options)) {
            const ret = new DBString();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBFloat extends Column<"float"> {
    static SerializedType = intersection([
        dict({
            type: "float",
            precision: optional(num),
            //scale: optional(num)
        }), Column.SerializedType
    ]);

    type: "float" = "float";

    fromJS = (data: number) => data.toString();
    toJS = Number;

    protected precision?: number;
    //protected scale?: number;

    constructor(options?: {precision?: number/*, scale?: number*/}) {
        super();
        this.precision = options?.precision;
        //this.scale = options?.scale;
    }

    getSQLType() {
        return "FLOAT" + this.precision == null ? "" : ("(" + this.precision + ")");
    }

    serialize(): typeof DBFloat.SerializedType.type {
        return {
            type: "float",
            precision: this.precision,
            //scale: this.scale,
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBFloat | null {
        if (this.SerializedType(options)) {
            const ret = new DBFloat();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBBoolean extends Column<"boolean"> {
    static SerializedType = ColumnType(Column, "boolean");

    type: "boolean" = "boolean";

    fromJS = (data: boolean) => data ? "true" : "false";
    toJS = Boolean;

    getSQLType() {
        return "BOOLEAN";
    }

    serialize(): typeof DBBoolean.SerializedType.type {
        return {
            type: "boolean",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBBoolean | null {
        if (this.SerializedType(options)) {
            const ret = new DBBoolean();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export function Day(year: number, month: number, day: number): Day {
    return {year, month, day};
}

export class DBDate extends Column<"date"> {
    static SerializedType = ColumnType(Column, "date");

    type: "date" = "date";

    fromJS = (data: Day) => data.year + "-" + data.month + "-" + data.day;
    toJS = (data: string) => {
        var res = data.split("-");
        if (res.length != 3) {
            throw Error("Invalid date format: " + data);
        }
        var res2 = res.map(Number);
        if (res2.some(Number.isNaN)) {
            throw Error("Invalid date format: " + data);
        }
        return {
            year: res2[0],
            month: res2[1],
            day: res2[2]
        };
    };

    getSQLType() {
        return "DATE";
    }

    serialize(): typeof DBDate.SerializedType.type {
        return {
            type: "date",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBDate | null {
        if (this.SerializedType(options)) {
            const ret = new DBDate();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBDateTime extends TimeColumn<"datetime"> {
    static SerializedType = ColumnType(TimeColumn, "datetime");

    type: "datetime" = "datetime";

    getSQLType() {
        return "TIMESTAMP";
    }

    serialize(): typeof DBDateTime.SerializedType.type {
        return {
            type: "datetime",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBDateTime | null {
        if (this.SerializedType(options)) {
            const ret = new DBDateTime();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBTime extends Column<"time"> {
    static SerializedType = ColumnType(Column, "time");
    
    type: "time" = "time";

    //precision?: number;

    getSQLType() {
        return "TIME";
    }

    serialize(): typeof DBTime.SerializedType.type {
        return {
            type: "time",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBTime | null {
        if (this.SerializedType(options)) {
            const ret = new DBTime();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBTimestamp extends TimeColumn<"timestamp"> {
    static SerializedType = ColumnType(TimeColumn, "timestamp");

    type: "timestamp" = "timestamp";

    getSQLType() {
        return "TIMESTAMP";
    }

    serialize(): typeof DBTimestamp.SerializedType.type {
        return {
            type: "timestamp",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBTimestamp | null {
        if (this.SerializedType(options)) {
            const ret = new DBTimestamp();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBBinary extends LengthColumn<"binary"> {
    static SerializedType = ColumnType(LengthColumn, "binary");

    type: "binary" = "binary";

    getSQLType() {
        return "BYTEA"/* + this.getLengthType()*/; //TODO: 
    }

    serialize(): typeof DBBinary.SerializedType.type {
        return {
            type: "binary",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBBinary | null {
        if (this.SerializedType(options)) {
            const ret = new DBBinary();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBEnum<T extends string> extends Column<"enum"> {
    static SerializedType = intersection([
        dict({
            type: "enum",
            values: array(str),
            postgres: optional(dict({
                useNative: bool,
                enumName: str,
                existingType: optional(bool),
                schemaName: optional(str)
            }))
        }), Column.SerializedType
    ]);

    type: "enum" = "enum";

    protected values: T[];
    protected postgres?: {
        useNative: boolean;
        enumName: string;
        existingType?: boolean;
        schemaName?: string;
    }

    constructor(values: T[], postgres?: {
        useNative: boolean;
        enumName: string;
        existingType?: boolean;
        schemaName?: string;
    }) {
        super();
        this.values = values;
        this.postgres = postgres;
    }

    getSQLType() {
        //return "ENUM(" + this.values.map(x => "'" +x.replace(/'/g, "''") + "'").join(",") + ")"; //TODO:
        return "VARCHAR(" + Math.max(...this.values.map(x => x.length)) + ")";
    }

    serialize(): typeof DBEnum.SerializedType.type {
        return {
            type: "enum",
            values: this.values,
            postgres: this.postgres,
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBEnum<string> | null {
        if (this.SerializedType(options)) {
            const ret = new DBEnum(options.values, options.postgres);
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBJson extends Column<"json"> {
    static SerializedType = ColumnType(Column, "json");

    type: "json" = "json";

    getSQLType() {
        return "JSON";
    }

    serialize(): typeof DBJson.SerializedType.type {
        return {
            type: "json",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBJson | null {
        if (this.SerializedType(options)) {
            const ret = new DBJson();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBJsonB extends Column<"json"> {
    static SerializedType = ColumnType(Column, "jsonb");

    type: "json" = "json";

    getSQLType() {
        return "JSONB";
    }

    serialize(): typeof DBJsonB.SerializedType.type {
        return {
            type: "jsonb",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBJsonB | null {
        if (this.SerializedType(options)) {
            const ret = new DBJsonB();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

export class DBUUID extends Column<"uuid"> {
    static SerializedType = ColumnType(Column, "uuid");

    type: "uuid" = "uuid";

    getSQLType() {
        return "UUID";
    }

    serialize(): typeof DBUUID.SerializedType.type {
        return {
            type: "uuid",
            ...super.serialize()
        };
    }

    static deserialize(options: any): DBUUID | null {
        if (this.SerializedType(options)) {
            const ret = new DBUUID();
            ret.deserialize(options);
            return ret;
        } else {
            return null;
        }
    }
}

const ColumnTypes = (function<T extends {[key: string]: (new (...args: any[]) => Column<SQLType>) & {
    SerializedType: TypeChecker<{type: string}>;
    deserialize(options: any): Column<SQLType> | null;
}}>(list: T) {
    return list;
})({
    increments: DBIncrements,
    integer: DBInteger,
    bigincrements: DBBigIncrements,
    biginteger: DBBigInteger,
    text: DBText,
    string: DBString,
    float: DBFloat,
    boolean: DBBoolean,
    date: DBDate,
    datetime: DBDateTime,
    time: DBTime,
    timestamp: DBTimestamp,
    binary: DBBinary,
    enum: DBEnum,
    json: DBJson,
    jsonb: DBJsonB,
    uuid: DBUUID
});

export function deserializeColumn(data: any): Column<SQLType> | null {
    const target = Object.values(ColumnTypes).find(val => val.SerializedType(data));
    if (target == null) {
        return null;
    }

    return target.deserialize(data);
}