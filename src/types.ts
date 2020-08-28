import { SQLType } from "./columns";

type GenericParser<F, T> = {
    toJS: (data: F) => T,
    toSQL: (data: T) => F,
    isT: (data: any) => data is T,
};
type StringParser<T> = GenericParser<string, T>;
type BufferParser<T> = GenericParser<Buffer, T>;
type EnumParser<T> = {
    toJS: <E extends string>(data: E) => T,
    toSQL: <E extends string>(data: T) => E,
    isT: (data: any) => data is T,
};

export type AllTypes = {[key in SQLType]: unknown};
export type TypeParser<T extends AllTypes> = {
    smallint: StringParser<T["smallint"]>,
    integer: StringParser<T["integer"]>,
    bigint: StringParser<T["bigint"]>,
    float: StringParser<T["float"]>,
    double: StringParser<T["double"]>,
    numeric: StringParser<T["numeric"]>,

    boolean: StringParser<T["boolean"]>,
    bit: StringParser<T["bit"]>,
    binary: BufferParser<T["binary"]>,

    text: StringParser<T["text"]>,

    enum: StringParser<T["enum"]>, //TODO: change to enum parser
    json: StringParser<T["json"]>, //TODO: change to JSON parser

    time: StringParser<T["time"]>,
    date: StringParser<T["date"]>,
    timestamp: StringParser<T["timestamp"]>,
};

export type DefaultTypes = {
    smallint: number,
    integer: number,
    bigint: bigint,
    float: number,
    double: number,
    numeric: string,

    boolean: boolean,
    bit: string,
    binary: Buffer,

    text: string,

    enum: string,
    json: string,

    time: string,
    date: Date,
    timestamp: Date,
};

export const defaultTypes: TypeParser<DefaultTypes> = {
    smallint: {
        toSQL: (data: number) => data.toString(),
        toJS: Number.parseInt,
        isT: (data): data is number => typeof data === 'number'
    },
    integer: {
        toSQL: (data: number) => data.toString(),
        toJS: Number.parseInt,
        isT: (data): data is number => typeof data === 'number'
    },
    bigint: {
        toSQL: (data: bigint) => data.toString(),
        toJS: BigInt,
        isT: (data): data is bigint => typeof data === 'bigint'
    },
    float: {
        toSQL: (data: number) => data.toString(),
        toJS: Number,
        isT: (data): data is number => typeof data === 'number'
    },
    double: {
        toSQL: (data: number) => data.toString(),
        toJS: Number,
        isT: (data): data is number => typeof data === 'number'
    },
    numeric: {
        toSQL: (data: string) => data,
        toJS: (data: string) => data,
        isT: (data): data is string => typeof data === 'string'
    },

    boolean: {
        toSQL: (data: boolean) => data.toString(),
        toJS: Boolean,
        isT: (data): data is boolean => typeof data === 'boolean'
    },
    bit: {
        toSQL: (data: string) => data,
        toJS: (data: string) => data,
        isT: (data): data is string => typeof data === 'string'
    },
    binary: {
        toSQL: (data: Buffer) => data,
        toJS: (data: Buffer) => data,
        isT: (data): data is Buffer => data instanceof Buffer
    },

    text: {
        toSQL: (data: string) => data,
        toJS: (data: string) => data,
        isT: (data): data is string => typeof data === 'string'
    },

    enum: {
        toSQL: <E extends string>(data: E) => data,
        toJS: <E extends string>(data: E) => data,
        isT: (data): data is string => typeof data === 'string'
    },
    json: {
        toSQL: (data: string) => data,
        toJS: (data: string) => data,
        isT: (data): data is string => typeof data === 'string'
    },

    time: {
        toSQL: (data: string) => data,
        toJS: (data: string) => data,
        isT: (data): data is string => typeof data === 'string'
    },
    date: {
        toSQL: (data: Date) => data.toISOString(),
        toJS: (data: string) => new Date(data),
        isT: (data): data is Date => data instanceof Date
    },
    timestamp: {
        toSQL: (data: Date) => data.toISOString(),
        toJS: (data: string) => new Date(data),
        isT: (data): data is Date => data instanceof Date
    },
};