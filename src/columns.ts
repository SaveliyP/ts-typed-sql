import { SQLType } from './queries';

export abstract class Column<T extends SQLType> {
    protected isNullable?: boolean;
    protected shouldDefaultTo?: string;
    type: T = <any> null;

    nullable(): void {
        this.isNullable = true;
    }

    nonNullable(): void {
        this.isNullable = false;
    }

    defaultTo(): void {
        
    }

    //abstract createColumn(): string;
    serialize() {
        return {
            nullable: this.isNullable,
            defaultTo: this.defaultTo
        }
    }
}

abstract class LengthColumn<T extends SQLType> extends Column<T> {
    protected length?: number;

    constructor(length?: number) {
        super();
        this.length = length;
    }
}

export class DBIncrements extends Column<number> {

}

export class DBInteger extends LengthColumn<number> {
}

export class DBBigIncrements extends Column<BigInt> {

}

export class DBBigInteger extends LengthColumn<BigInt> {
}

export class DBText extends Column<string> {
    protected textType?: "text" | "mediumtext" | "longtext";
}

export class DBString extends LengthColumn<string> {
}

export class DBFloat extends Column<number> {
    protected precision?: number;
    protected scale?: number;
}

export class DBBoolean extends Column<boolean> {

}

export class DBDate extends Column<Date> {

}

export class DBDateTime extends Column<Date> {
    protected useTz?: boolean;
    protected precision?: number;
}

export class DBTime extends Column<Date> {
    //precision?: number;
}

export class DBTimestamp extends Column<Date> {
    protected useTz?: boolean;
    protected preicision?: number;
}

export class DBBinary extends LengthColumn<Buffer> {
}

export class DBEnum<T extends string> extends Column<T> {
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
}

export class DBJson extends Column<Object> {

}

export class DBJsonB extends Column<Object> {

}

export class DBUUID extends Column<Buffer> {

}